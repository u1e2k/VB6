// Native POSIX-backed VB files. Handles and layouts remain classic VB widths.
#include "vb6.hpp"
#include "library.hpp"
#include "calendar.hpp"
#include "file-codec.hpp"
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fstream>
#include <mutex>

namespace vb6 {
namespace {
[[noreturn]] void ioError(int code,const std::string&path=""){
  int number=code==ENOENT?53:code==ENOTDIR?76:code==EEXIST?58:code==ENOSPC||code==EDQUOT?61:code==EMFILE||code==ENFILE?67:code==EACCES||code==EPERM||code==EAGAIN?70:code==EROFS?70:code==ENAMETOOLONG||code==EINVAL?52:code==ENOTEMPTY?75:57;
  fail(number,path.empty()?std::strerror(code):path+": "+std::strerror(code));
}
std::filesystem::path nativePath(const Value&value){
  auto text=value.string();if(text.empty()||text.find(char16_t(0))!=Text::npos)fail(52);
  auto path=toUTF8(text);std::replace(path.begin(),path.end(),'\\','/');
  if(path.size()>1&&path[1]==':')fail(52,"Use a native macOS path, not a Windows drive letter");
  return std::filesystem::path(path);
}
int fileNumber(const Value&value){auto n=coerce(value,"long").integral();if(n<1||n>511)fail(52);return int(n);}
int64_t bounded(const Value&value,int64_t min,int64_t max){auto n=coerce(value,"long").integral();if(n<min||n>max)fail(5);return n;}
int64_t fileSize(int fd){struct stat s{};if(fstat(fd,&s)<0)ioError(errno);if(s.st_size>INT32_MAX)fail(6,"File length exceeds the VB6 Long range");return s.st_size;}
struct Range { int64_t start,end; };
}
struct FileState {
  int fd=-1,number=0;std::filesystem::path path;std::string mode,access,sharing;
  uint64_t device=0,inode=0;int64_t position=0,recordLength=1,lastRecord=0;size_t printColumn=0;std::vector<Range>locks;
  ~FileState(){if(fd>=0)::close(fd);}
};
namespace {
std::shared_ptr<FileState> handle(Runtime&rt,Value number){auto n=fileNumber(number);auto it=rt.files.find(n);if(it==rt.files.end())fail(52);return it->second;}
void require(const FileState&f,const std::string&access){if(f.access.find(access)==std::string::npos)fail(54);}
bool same(const FileState&a,const FileState&b){return a.device==b.device&&a.inode==b.inode;}
void unlocked(Runtime&rt,const FileState&f,int64_t begin,int64_t end){for(auto&entry:rt.files){auto&other=*entry.second;if(other.number==f.number||!same(f,other))continue;for(auto&r:other.locks)if(begin<r.end&&end>r.start)fail(70);}}
Bytes readAt(FileState&f,int64_t at,size_t count,bool exact=true){
  if(count>MaxRecordBytes)fail(7,"Read exceeds the 20 MiB record limit");Bytes result(count);size_t total=0;
  while(total<count){auto n=pread(f.fd,result.data()+total,count-total,at+int64_t(total));if(n<0){if(errno==EINTR)continue;ioError(errno,f.path.string());}if(!n)break;total+=size_t(n);}
  if(exact&&total!=count)fail(62);result.resize(total);return result;
}
void writeAt(FileState&f,int64_t at,const Bytes&bytes){
  if(at<0||uint64_t(at)+bytes.size()>INT32_MAX)fail(6,"File position exceeds the VB6 Long range");size_t written=0;
  while(written<bytes.size()){auto n=pwrite(f.fd,bytes.data()+written,bytes.size()-written,at+int64_t(written));if(n<0){if(errno==EINTR)continue;ioError(errno,f.path.string());}if(!n)fail(57,"Write made no progress");written+=size_t(n);}
}
int64_t bytePosition(FileState&f,Value position){if(position.type==Type::Missing)return f.position;auto n=bounded(position,1,INT32_MAX);auto result=(n-1)*(f.mode=="random"?f.recordLength:1);if(result>INT32_MAX)fail(6);return result;}
Text readCharacters(Runtime&rt,Value number,int64_t count){
  if(count<0||count>int64_t(MaxRecordBytes))fail(5);auto f=handle(rt,number);require(*f,"read");if(f->mode!="input"&&f->mode!="binary")fail(54);
  unlocked(rt,*f,f->position,f->position+count);auto bytes=readAt(*f,f->position,size_t(count));f->position+=count;return decodeANSI(bytes);
}
Text nextLine(Runtime&rt,Value number){
  auto f=handle(rt,number);require(*f,"read");if(f->mode!="input")fail(54);auto size=fileSize(f->fd);if(f->position>=size)fail(62);
  Bytes bytes;int64_t start=f->position,at=start;bool done=false;
  while(at<size&&!done){auto chunk=readAt(*f,at,size_t(std::min(int64_t(4096),size-at)));for(auto c:chunk){++at;if(c=='\n'){done=true;break;}bytes.push_back(c);if(bytes.size()>MaxRecordBytes)fail(7,"Line exceeds the record limit");}}
  unlocked(rt,*f,start,at);f->position=at;if(!bytes.empty()&&bytes.back()=='\r')bytes.pop_back();return decodeANSI(bytes);
}
Value nextInput(Runtime&rt,Value number,const std::string&type){
  auto f=handle(rt,number);require(*f,"read");if(f->mode!="input"&&f->mode!="binary")fail(54);auto size=fileSize(f->fd);if(f->position>=size)fail(62);
  // Read a bounded field. A missing delimiter at the limit is an error, never truncation.
  auto bytes=readAt(*f,f->position,size_t(std::min(int64_t(MaxRecordBytes),size-f->position)));
  auto result=readInputField(decodeANSI(bytes),0,type);unlocked(rt,*f,f->position,f->position+int64_t(result.second));f->position+=int64_t(result.second);return result.first;
}
int freeFile(Runtime&rt,int range){if(range<0||range>1)fail(5);for(int i=range?256:1;i<=(range?511:255);i++)if(!rt.files.count(i))return i;fail(67);}
bool wild(Text text,Text pattern){return like(changeCase(text,false),changeCase(pattern,false));}
struct DirectoryState {std::vector<Text>names;size_t position=0;};
void removeFile(Runtime&rt,const std::filesystem::path&path){
  struct stat st{};if(stat(path.c_str(),&st)<0)ioError(errno,path.string());for(auto&entry:rt.files)if(entry.second->device==uint64_t(st.st_dev)&&entry.second->inode==uint64_t(st.st_ino))fail(55);
  if(unlink(path.c_str())<0)ioError(errno,path.string());
}
int attributes(const std::filesystem::path&path){struct stat s{};if(stat(path.c_str(),&s)<0)ioError(errno,path.string());int flags=(s.st_mode&S_IWUSR)?0:1;if(path.filename().string().rfind(".",0)==0)flags|=2;flags|=S_ISDIR(s.st_mode)?16:32;
#ifdef __APPLE__
  if(s.st_flags&UF_HIDDEN)flags|=2;
#endif
  return flags;
}
class TextStream final:public Object {
  Runtime*rt_;int handle_;bool closed_=false;
public:
  TextStream(Runtime&rt,int h):rt_(&rt),handle_(h){}
  ~TextStream()override=default; // File lifetime is explicitly owned by Runtime.
  std::string className()const override{return "TextStream";}
  void open()const{if(closed_||!rt_->files.count(handle_))fail(52);}
  Value get(Runtime&,const std::string&name)override{open();auto f=handle(*rt_,Value::integer(handle_));auto n=lower(name);if(n=="atendofstream")return Value::boolean(f->position>=fileSize(f->fd));if(n=="atendofline"){auto size=fileSize(f->fd);if(f->position>=size)return Value::boolean(true);auto bytes=readAt(*f,f->position,1);return Value::boolean(bytes[0]=='\r'||bytes[0]=='\n');}fail(438);}
  Value invoke(Runtime&rt,const std::string&name,Args args)override{
    auto n=lower(name);if(n=="close"){if(!args.empty())fail(450);open();rt.files.erase(handle_);closed_=true;return {};}
    open();if(n=="readline"){if(!args.empty())fail(450);return Value::string(nextLine(rt,Value::integer(handle_)));}
    if(n=="read"||n=="skip"){args=bindNamed(args,"characters");auto value=readCharacters(rt,Value::integer(handle_),integerArgument(args,0));return n=="skip"?Value{}:Value::string(value);}
    if(n=="readall"){if(!args.empty())fail(450);auto f=handle(rt,Value::integer(handle_));return Value::string(readCharacters(rt,Value::integer(handle_),fileSize(f->fd)-f->position));}
    if(n=="skipline"){nextLine(rt,Value::integer(handle_));return {};}
    if(n=="write"||n=="writeline"||n=="writeblanklines"){
      args=bindNamed(args,n=="writeline"?"text?":n=="write"?"text":"lines");Text text;
      if(n=="writeblanklines"){auto count=integerArgument(args,0);if(count<0||count>int64_t(MaxRecordBytes/2))fail(5);for(int64_t i=0;i<count;i++)text+=u"\r\n";}else text=stringArgument(args,0)+(n=="writeline"?u"\r\n":u"");
      auto f=handle(rt,Value::integer(handle_));require(*f,"write");auto bytes=encodeANSI(text);if(f->mode=="append")f->position=fileSize(f->fd);unlocked(rt,*f,f->position,f->position+int64_t(bytes.size()));writeAt(*f,f->position,bytes);f->position+=int64_t(bytes.size());return {};
    }
    return get(rt,name);
  }
};
class FileInfo final:public Object {
  std::filesystem::path path_;
public:
  explicit FileInfo(std::filesystem::path path):path_(std::move(path)){}
  std::string className()const override{return "File";}
  Value get(Runtime&,const std::string&raw)override{auto name=lower(raw);if(name=="name")return Value::string(fromUTF8(path_.filename().string()));if(name=="path"||name.empty())return Value::string(fromUTF8(std::filesystem::absolute(path_).string()));if(name=="size"){struct stat st{};if(stat(path_.c_str(),&st)<0)ioError(errno);return Value::real(double(st.st_size));}if(name=="attributes")return Value::integer(attributes(path_));fail(438);}
};
class FileSystem final:public Object {
public:
  std::string className()const override{return "Scripting.FileSystemObject";}
  Value invoke(Runtime&rt,const std::string&raw,Args args)override{
    auto name=lower(raw);
    if(name=="fileexists"||name=="folderexists"){args=bindNamed(args,"path");std::error_code ec;auto path=nativePath(args[0].value);bool exists=name=="fileexists"?std::filesystem::is_regular_file(path,ec):std::filesystem::is_directory(path,ec);return Value::boolean(exists&&!ec);}
    if(name=="opentextfile"||name=="createtextfile"){
      args=bindNamed(args,name=="opentextfile"?"filename,iomode?,create?,format?":"filename,overwrite?,unicode?");auto path=nativePath(args[0].value);auto mode=name=="opentextfile"?integerArgument(args,1,1):2;
      if(mode!=1&&mode!=2&&mode!=8)fail(5);if((name=="opentextfile"&&integerArgument(args,3,0)!=0)||(name=="createtextfile"&&argument(args,2,Value::boolean(false)).truth()))fail(5,"Native TextStream currently requires Windows-1252 encoding");
      bool exists=std::filesystem::exists(path),create=name=="createtextfile"||argument(args,2,Value::boolean(false)).truth();if(name=="createtextfile"&&exists&&!argument(args,1,Value::boolean(true)).truth())fail(58);
      if(!exists&&!create)fail(53);if(!exists&&mode==1){int fd=::open(path.c_str(),O_WRONLY|O_CREAT|O_EXCL|O_CLOEXEC,0666);if(fd<0)ioError(errno);::close(fd);}
      // An initialization-only module supplies no project authority or callbacks.
      Module module;module.name="NativeFileSystem";auto self=std::make_shared<Instance>(rt,module);Frame frame(rt,self);int number=freeFile(rt,0);fileOpen(frame,args[0].value,mode==1?"input":mode==8?"append":"output",Value::integer(number),Value::integer(128),"","");return Value::object(std::make_shared<TextStream>(rt,number));
    }
    if(name=="deletefile"){args=bindNamed(args,"filespec,force?");auto path=nativePath(args[0].value);if(argument(args,1,Value::boolean(false)).truth()){struct stat s{};if(stat(path.c_str(),&s)==0)chmod(path.c_str(),s.st_mode|S_IWUSR);}removeFile(rt,path);return {};}
    if(name=="copyfile"||name=="movefile"){args=bindNamed(args,name=="copyfile"?"source,destination,overwrite?":"source,destination");if(name=="copyfile"&&!argument(args,2,Value::boolean(true)).truth()&&std::filesystem::exists(nativePath(args[1].value)))fail(58);fileMoveCopy(args[0].value,args[1].value,name=="movefile");return {};}
    if(name=="createfolder"){args=bindNamed(args,"foldername");auto path=nativePath(args[0].value);if(mkdir(path.c_str(),0777)<0)ioError(errno,path.string());return Value::object(std::make_shared<FileInfo>(path));}
    if(name=="getfile"){args=bindNamed(args,"filespec");auto path=nativePath(args[0].value);if(!std::filesystem::is_regular_file(path))fail(53);return Value::object(std::make_shared<FileInfo>(path));}
    if(name=="buildpath"){args=bindNamed(args,"path,name");return Value::string(fromUTF8((nativePath(args[0].value)/nativePath(args[1].value)).lexically_normal().string()));}
    if(name=="getabsolutepathname"||name=="getfilename"||name=="getbasename"||name=="getextensionname"||name=="getparentfoldername"){
      args=bindNamed(args,"path");auto path=nativePath(args[0].value);auto output=name=="getabsolutepathname"?std::filesystem::absolute(path).lexically_normal():name=="getfilename"?path.filename():name=="getbasename"?path.stem():name=="getparentfoldername"?path.parent_path():path.extension();auto text=output.string();if(name=="getextensionname"&&!text.empty())text.erase(text.begin());return Value::string(fromUTF8(text));
    }
    fail(438);
  }
};
}
Value createFileObject(const std::string&name){if(lower(name)=="scripting.filesystemobject")return Value::object(std::make_shared<FileSystem>());fail(429);}
void fileOpen(Frame&frame,Value pathValue,const std::string&rawMode,Value numberValue,Value lengthValue,const std::string&rawAccess,const std::string&rawSharing){
  auto&rt=frame.runtime;auto number=fileNumber(numberValue);if(rt.files.count(number))fail(52);auto mode=lower(rawMode);if(mode!="input"&&mode!="output"&&mode!="append"&&mode!="binary"&&mode!="random")fail(54);
  auto access=lower(rawAccess.empty()?(mode=="input"?"read":mode=="binary"||mode=="random"?"read write":"write"):rawAccess),sharing=lower(rawSharing.empty()?"shared":rawSharing);
  if(access!="read"&&access!="write"&&access!="read write")fail(54);if((mode=="input"&&access!="read")||((mode=="output"||mode=="append")&&access!="write"))fail(54);
  if(sharing!="shared"&&sharing!="lock read"&&sharing!="lock write"&&sharing!="lock read write")fail(5);
  auto path=nativePath(pathValue);auto state=std::make_shared<FileState>();state->path=path;state->mode=mode;state->access=access;state->sharing=sharing;state->number=number;state->recordLength=mode=="random"?bounded(lengthValue,1,32767):1;
  // Do not truncate until all in-process sharing checks have succeeded.
  int flags=O_CLOEXEC|(access=="read"?O_RDONLY:access=="write"?O_WRONLY:O_RDWR);if(mode!="input"&&access!="read")flags|=O_CREAT;
  state->fd=::open(path.c_str(),flags,0666);if(state->fd<0){rt.error.lastDllError=errno;ioError(errno,path.string());}struct stat st{};if(fstat(state->fd,&st)<0)ioError(errno);if(!S_ISREG(st.st_mode))fail(54,"VB file numbers require regular files");state->device=uint64_t(st.st_dev);state->inode=uint64_t(st.st_ino);
  auto denied=[](const std::string&share,const std::string&access){return share=="lock read write"||(share=="lock read"&&access.find("read")!=std::string::npos)||(share=="lock write"&&access.find("write")!=std::string::npos);};
  for(auto&entry:rt.files){auto&other=*entry.second;if(same(*state,other)&&(mode=="output"||other.mode=="output"||denied(other.sharing,access)||denied(sharing,other.access)))fail(70);}
  if(mode=="output"&&ftruncate(state->fd,0)<0)ioError(errno);state->position=mode=="append"?fileSize(state->fd):0;rt.files[number]=state;
}
void fileClose(Frame&f,std::vector<Value>numbers){if(numbers.empty()){f.runtime.files.clear();return;}for(auto&v:numbers){auto n=fileNumber(v);if(!f.runtime.files.erase(n))fail(52);}}
void fileSeek(Frame&f,Value number,Value position){auto h=handle(f.runtime,number);h->position=bytePosition(*h,position);}
void filePrint(Frame&f,Value number,std::vector<Value>values,bool write,bool newline,const std::vector<std::string>&separators){
  auto h=handle(f.runtime,number);require(*h,"write");if(h->mode!="output"&&h->mode!="append")fail(54);Text text;
  for(size_t i=0;i<values.size();i++){if(i){if(write)text+=u',';else if(i-1<separators.size()&&separators[i-1]==","){size_t column=(h->printColumn+text.size())%14;text+=Text(14-column,u' ');}else if(separators.empty())text+=u' ';}text+=write?writeInputValue(values[i]):printValue(values[i]);}
  h->printColumn+=text.size();if(newline||write){text+=u"\r\n";h->printColumn=0;}auto bytes=encodeANSI(text);if(h->mode=="append")h->position=fileSize(h->fd);unlocked(f.runtime,*h,h->position,h->position+int64_t(bytes.size()));writeAt(*h,h->position,bytes);h->position+=int64_t(bytes.size());
}
void fileInput(Frame&f,Value number,std::vector<Ref>targets,bool line){if(line){if(targets.size()!=1)fail(5);targets[0].set(Value::string(nextLine(f.runtime,number)));return;}for(auto&target:targets)target.set(nextInput(f.runtime,number,target.type));}
void fileGetPut(Frame&f,Value number,Value position,Ref reference,bool put){
  auto h=handle(f.runtime,number);if(h->mode!="binary"&&h->mode!="random")fail(54);require(*h,put?"write":"read");auto start=bytePosition(*h,position);FileSchema schema{reference.type,reference.fixedLength,reference.array};auto current=reference.get();
  if(put){auto bytes=encodeVariable(current,schema,h->mode);auto count=h->mode=="random"?h->recordLength:int64_t(bytes.size());if(int64_t(bytes.size())>count)fail(59);if(start+count>INT32_MAX)fail(6);unlocked(f.runtime,*h,start,start+count);writeAt(*h,start,bytes);if(start+count>fileSize(h->fd)&&ftruncate(h->fd,start+count)<0)ioError(errno);h->position=start+count;}
  else{auto size=fileSize(h->fd);auto count=h->mode=="random"?h->recordLength:std::min(int64_t(MaxRecordBytes),size-start);if(start>=size||count<0||start+count>size)fail(62);auto bytes=readAt(*h,start,size_t(count));auto decoded=decodeVariable(bytes,schema,current,h->mode,f.runtime.maxArrayElements);auto end=start+(h->mode=="random"?count:int64_t(decoded.second));unlocked(f.runtime,*h,start,end);reference.set(decoded.first);h->position=end;}
  h->lastRecord=start/h->recordLength+1;
}
void fileLock(Frame&f,Value number,Value startValue,Value endValue,bool unlock){
  auto h=handle(f.runtime,number);auto start=startValue.type==Type::Missing?0:bytePosition(*h,startValue),unit=h->mode=="random"?h->recordLength:1;
  auto end=endValue.type==Type::Missing?(startValue.type==Type::Missing?int64_t(INT32_MAX):start+unit):bounded(endValue,1,INT32_MAX)*unit;if(end<=start||end>INT32_MAX)fail(5);
  auto found=std::find_if(h->locks.begin(),h->locks.end(),[&](auto&r){return r.start==start&&r.end==end;});if(unlock&&found==h->locks.end())fail(70);if(!unlock)unlocked(f.runtime,*h,start,end);
  struct flock lock{};lock.l_type=unlock?F_UNLCK:h->access=="read"?F_RDLCK:F_WRLCK;lock.l_whence=SEEK_SET;lock.l_start=start;lock.l_len=end==INT32_MAX?0:end-start;if(fcntl(h->fd,F_SETLK,&lock)<0)ioError(errno);if(unlock)h->locks.erase(found);else h->locks.push_back({start,end});
}
void fileMoveCopy(Value source,Value destination,bool rename){
  auto a=nativePath(source),b=nativePath(destination);std::error_code ec;if(rename){if(std::filesystem::exists(b))fail(58);std::filesystem::rename(a,b,ec);}else std::filesystem::copy_file(a,b,std::filesystem::copy_options::overwrite_existing,ec);if(ec)ioError(ec.value());
}
void installFileBuiltins(Runtime&rt){
  addBuiltin(rt,"FreeFile","rangenumber?",[](Frame&f,Args a){return Value::integer(freeFile(f.runtime,int(integerArgument(a,0,0))),Type::Integer);});
  addBuiltin(rt,"EOF","filenumber",[](Frame&f,Args a){auto h=handle(f.runtime,a[0].value);return Value::boolean(h->position>=fileSize(h->fd));});
  addBuiltin(rt,"LOF","filenumber",[](Frame&f,Args a){return Value::integer(fileSize(handle(f.runtime,a[0].value)->fd));});
  addBuiltin(rt,"Loc","filenumber",[](Frame&f,Args a){auto h=handle(f.runtime,a[0].value);return Value::integer(h->mode=="random"?h->lastRecord:h->mode=="binary"?h->position:h->position/128);});
  addBuiltin(rt,"Seek","filenumber",[](Frame&f,Args a){auto h=handle(f.runtime,a[0].value);return Value::integer(h->position/(h->mode=="random"?h->recordLength:1)+1);});
  addBuiltin(rt,"Input","number,filenumber",[](Frame&f,Args a){return Value::string(readCharacters(f.runtime,a[1].value,integerArgument(a,0)));});rt.builtins["input$"]=rt.builtins.at("input");
  addBuiltin(rt,"FileAttr","filenumber,returntype?",[](Frame&f,Args a){auto h=handle(f.runtime,a[0].value);auto mode=integerArgument(a,1,1);if(mode==2)fail(5,"FileAttr OS handles are not portable; use native file APIs explicitly");if(mode!=1)fail(5);return Value::integer(h->mode=="input"?1:h->mode=="output"?2:h->mode=="random"?4:h->mode=="append"?8:32);});
  addBuiltin(rt,"FileLen","pathname",[](Frame&,Args a){auto path=nativePath(a[0].value);struct stat st{};if(stat(path.c_str(),&st)<0)ioError(errno,path.string());if(st.st_size>INT32_MAX)fail(6);return Value::integer(st.st_size);});
  addBuiltin(rt,"FileDateTime","pathname",[](Frame&,Args a){auto path=nativePath(a[0].value);struct stat st{};if(stat(path.c_str(),&st)<0)ioError(errno,path.string());std::tm tm{};auto time=st.st_mtime;if(!localtime_r(&time,&tm))fail(5);return civilDate({tm.tm_year+1900,tm.tm_mon+1,tm.tm_mday,tm.tm_hour,tm.tm_min,tm.tm_sec,0});});
  addBuiltin(rt,"CurDir","drive?",[](Frame&,Args a){if(argument(a,0).type!=Type::Missing&&!stringArgument(a,0).empty())fail(68,"macOS does not use drive letters");return Value::string(fromUTF8(std::filesystem::current_path().string()));});rt.builtins["curdir$"]=rt.builtins.at("curdir");
  addBuiltin(rt,"ChDir","path",[](Frame&,Args a){auto path=nativePath(a[0].value);if(chdir(path.c_str())<0)ioError(errno,path.string());return Value{};});
  addBuiltin(rt,"ChDrive","drive",[](Frame&,Args){fail(68,"macOS does not use drive letters");return Value{};});
  addBuiltin(rt,"MkDir","path",[](Frame&,Args a){auto path=nativePath(a[0].value);if(mkdir(path.c_str(),0777)<0)ioError(errno,path.string());return Value{};});
  addBuiltin(rt,"RmDir","path",[](Frame&,Args a){auto path=nativePath(a[0].value);if(rmdir(path.c_str())<0)ioError(errno,path.string());return Value{};});
  addBuiltin(rt,"GetAttr","pathname",[](Frame&,Args a){return Value::integer(attributes(nativePath(a[0].value)),Type::Integer);});
  addBuiltin(rt,"SetAttr","pathname,attributes",[](Frame&,Args a){auto path=nativePath(a[0].value);auto flags=integerArgument(a,1);if(flags<0||(flags&~39))fail(5);struct stat st{};if(stat(path.c_str(),&st)<0)ioError(errno,path.string());if(chmod(path.c_str(),flags&1?st.st_mode&~(S_IWUSR|S_IWGRP|S_IWOTH):st.st_mode|S_IWUSR)<0)ioError(errno);
#ifdef __APPLE__
    if(chflags(path.c_str(),flags&2?st.st_flags|UF_HIDDEN:st.st_flags&~UF_HIDDEN)<0)ioError(errno);
#else
    if(bool(flags&2)!=bool(attributes(path)&2))fail(5,"Hidden file attributes require macOS");
#endif
    if(flags&4)fail(5,"Windows system attributes have no native macOS equivalent");return Value{};});
  auto directory=std::make_shared<DirectoryState>();
  addBuiltin(rt,"Dir","pathname?,attributes?",[directory](Frame&,Args a){
    if(argument(a,0).type!=Type::Missing){auto path=nativePath(a[0].value);auto flags=integerArgument(a,1,0);if(flags<0||flags>63)fail(5);directory->names.clear();directory->position=0;auto parent=path.parent_path().empty()?std::filesystem::path("."):path.parent_path();auto pattern=fromUTF8(path.filename().string());std::error_code ec;
      for(std::filesystem::directory_iterator it(parent,ec),end;!ec&&it!=end;it.increment(ec)){auto name=fromUTF8(it->path().filename().string());auto attr=attributes(it->path());if(!wild(name,pattern)||(attr&16&&!(flags&16))||(attr&2&&!(flags&2)))continue;directory->names.push_back(name);}if(ec&&ec.value()!=ENOENT)ioError(ec.value());std::sort(directory->names.begin(),directory->names.end());
    }
    return Value::string(directory->position<directory->names.size()?directory->names[directory->position++]:Text{});
  });rt.builtins["dir$"]=rt.builtins.at("dir");
  addBuiltin(rt,"Kill","pathname",[](Frame&f,Args a){auto path=nativePath(a[0].value);auto pattern=fromUTF8(path.filename().string());if(pattern.find_first_of(u"*?")==Text::npos){removeFile(f.runtime,path);return Value{};}auto parent=path.parent_path().empty()?std::filesystem::path("."):path.parent_path();std::vector<std::filesystem::path>matches;std::error_code ec;for(std::filesystem::directory_iterator it(parent,ec),end;!ec&&it!=end;it.increment(ec))if(it->is_regular_file()&&wild(fromUTF8(it->path().filename().string()),pattern))matches.push_back(it->path());if(ec)ioError(ec.value());if(matches.empty())fail(53);for(auto&p:matches)removeFile(f.runtime,p);return Value{};});
}
} // namespace vb6

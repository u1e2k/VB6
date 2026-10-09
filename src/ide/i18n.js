/**
 * Visual Basic 6.0 Japanese Localization (日本語版) dictionary and translation service.
 */

let currentLocale = (typeof localStorage !== 'undefined' && localStorage.getItem('vb6-studio-web.language')) || 'ja';

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = locale === 'en' ? 'en' : 'ja';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vb6-studio-web.language', currentLocale);
    }
  } catch {}
}

export const JA = {
  // Application & Titlebar
  'app.title': 'Microsoft Visual Basic',
  'app.titleMode.design': 'デザイン',
  'app.titleMode.break': '中断',
  'app.titleMode.run': '実行',
  'app.fullScreen': '全画面表示の切り替え',
  'app.about': 'このアプリケーションについて',
  'app.ready': '準備完了',
  'app.status.cursor': (ln, col) => `行 ${ln}、列 ${col}`,

  // Menu bar titles
  'menu.file': 'ファイル(&F)',
  'menu.edit': '編集(&E)',
  'menu.view': '表示(&V)',
  'menu.project': 'プロジェクト(&P)',
  'menu.format': '書式(&O)',
  'menu.debug': 'デバッグ(&D)',
  'menu.run': '実行(&R)',
  'menu.tools': 'ツール(&T)',
  'menu.window': 'ウィンドウ(&W)',
  'menu.help': 'ヘルプ(&H)',

  // File menu
  'menu.file.new': '新規作成(&N)...',
  'menu.file.open': 'プロジェクトを開く(&O)...',
  'menu.file.openFolder': 'プロジェクト フォルダを開く(&D)...',
  'menu.file.save': 'プロジェクトの保存(&S)',
  'menu.file.saveAs': '名前を付けてプロジェクトの保存(&A)...',
  'menu.file.saveModule': name => `名前を付けて ${name} を保存(&A)...`,
  'menu.file.exportHTML': name => `${name}.html の作成(&K)...`,
  'menu.file.exportSources': 'ソース プロジェクトのエクスポート (.zip)(&E)...',
  'menu.file.virtualFiles': 'プロジェクトの仮想ファイル(&V)...',
  'menu.file.print': '印刷(&P)...',
  'menu.file.projectProperties': 'プロジェクトのプロパティ(&E)...',
  'menu.file.close': 'プロジェクトを閉じる(&C)',

  // Edit menu
  'menu.edit.undo': '元に戻す(&U)',
  'menu.edit.redo': 'やり直し(&R)',
  'menu.edit.cut': '切り取り(&T)',
  'menu.edit.copy': 'コピー(&C)',
  'menu.edit.paste': '貼り付け(&P)',
  'menu.edit.delete': '削除(&D)',
  'menu.edit.selectAll': 'すべて選択(&A)',
  'menu.edit.find': '検索(&F)...',
  'menu.edit.replace': '置換(&R)...',
  'menu.edit.findNext': '次を検索(&N)',
  'menu.edit.findProject': 'プロジェクト内を検索(&P)...',
  'menu.edit.replaceProject': 'プロジェクト内を置換(&O)...',
  'menu.edit.bookmarks': 'ブックマーク(&B)',
  'menu.edit.toggleBookmark': 'ブックマークの設定/解除(&B)',
  'menu.edit.nextBookmark': '次のブックマーク(&N)',
  'menu.edit.previousBookmark': '前のブックマーク(&P)',
  'menu.edit.clearBookmarks': 'すべてのブックマークを解除(&C)',
  'menu.edit.goTo': '行へ移動(&G)...',
  'menu.edit.comment': 'コメント ブロック(&M)',
  'menu.edit.uncomment': '非コメント ブロック(&U)',
  'menu.edit.formatCode': 'コードのフォーマット(&F)',
  'menu.edit.renameSymbol': 'シンボルの名前変更(&R)...',

  // View menu
  'menu.view.code': 'コード(&C)',
  'menu.view.object': 'オブジェクト(&O)',
  'menu.view.objectBrowser': 'オブジェクト ブラウザ(&B)',
  'menu.view.immediate': 'イミディエイト ウィンドウ(&I)',
  'menu.view.locals': 'ローカル ウィンドウ(&L)',
  'menu.view.watch': 'ウォッチ ウィンドウ(&W)',
  'menu.view.callStack': '呼び出し履歴(&K)',
  'menu.view.errors': 'エラー一覧(&E)',
  'menu.view.output': '出力(&U)',
  'menu.view.projectExplorer': 'プロジェクト エクスプローラ(&R)',
  'menu.view.properties': 'プロパティ ウィンドウ(&P)',
  'menu.view.toolbox': 'ツールボックス(&X)',
  'menu.view.formLayout': 'フォーム レイアウト ウィンドウ(&F)',
  'menu.view.tabOrder': 'タブ オーダー(&T)',
  'menu.view.colorPalette': 'カラー パレット(&A)',

  // Project menu
  'menu.project.addForm': 'フォームの追加(&F)',
  'menu.project.addMDIForm': 'MDI フォームの追加(&M)',
  'menu.project.addModule': '標準モジュールの追加(&M)',
  'menu.project.addClass': 'クラス モジュールの追加(&C)',
  'menu.project.addFiles': 'ファイルの追加(&D)...',
  'menu.project.components': 'コンポーネント(&O)...',
  'menu.project.references': '参照設定(&R)...',
  'menu.project.properties': name => `${name} のプロパティ(&E)...`,

  // Format menu
  'menu.format.align': '整列(&A)',
  'menu.format.alignLefts': '左揃え(&L)',
  'menu.format.alignCenters': '左右中央揃え(&C)',
  'menu.format.alignRights': '右揃え(&R)',
  'menu.format.alignTops': '上揃え(&T)',
  'menu.format.alignMiddles': '上下中央揃え(&M)',
  'menu.format.alignBottoms': '下揃え(&B)',
  'menu.format.makeSameSize': '同じサイズに揃える(&S)',
  'menu.format.width': '幅(&W)',
  'menu.format.height': '高さ(&H)',
  'menu.format.both': '幅と高さ(&B)',
  'menu.format.horizontalSpacing': '水平方向の間隔(&H)',
  'menu.format.verticalSpacing': '垂直方向の間隔(&V)',
  'menu.format.makeEqual': '均等に配置(&E)',
  'menu.format.increase': '間隔を広げる(&I)',
  'menu.format.decrease': '間隔を狭める(&D)',
  'menu.format.remove': '間隔をなくす(&R)',
  'menu.format.centerInForm': 'フォームの中央に配置(&C)',
  'menu.format.horizontally': '水平方向(&H)',
  'menu.format.vertically': '垂直方向(&V)',
  'menu.format.sizeTo': 'サイズを合わせる(&T)',
  'menu.format.grid': 'グリッド(&G)',
  'menu.format.tallest': '最も高い(&T)',
  'menu.format.shortest': '最も低い(&S)',
  'menu.format.widest': '最も広い(&W)',
  'menu.format.narrowest': '最も狭い(&N)',
  'menu.format.bringToFront': '最前面へ移動(&F)',
  'menu.format.sendToBack': '最背面へ移動(&B)',
  'menu.format.alignToGrid': 'グリッドに合わせる(&G)',
  'menu.format.lockControls': 'コントロールのロック(&K)',
  'menu.format.showGrid': 'グリッドの表示(&S)',
  'menu.format.snapToGrid': 'グリッドにスナップ(&N)',

  // Debug menu
  'menu.debug.applyEdits': 'コード変更の適用(&A)',
  'menu.debug.setNextStatement': '次のステートメントの設定(&N)',
  'menu.debug.stepInto': 'ステップ イン(&I)',
  'menu.debug.stepOver': 'ステップ オーバー(&O)',
  'menu.debug.stepOut': 'ステップ アウト(&T)',
  'menu.debug.breakpoint': 'ブレークポイントの設定/解除(&B)',
  'menu.debug.conditionalBreakpoint': 'ブレークポイントの条件(&E)...',
  'menu.debug.clearBreakpoints': 'すべてのブレークポイントの解除(&C)',
  'menu.debug.addWatch': 'ウォッチ式の追加(&A)...',
  'menu.debug.quickWatch': 'クイック ウォッチ(&Q)...',
  'menu.debug.breakpoints': 'ブレークポイント ウィンドウ(&W)',
  'menu.debug.checkSyntax': 'プロジェクト構文のチェック(&S)',

  // Run menu
  'menu.run.start': '開始(&S)',
  'menu.run.continue': '続行(&S)',
  'menu.run.startWithBreak': '中断付きで開始(&W)',
  'menu.run.break': '中断(&B)',
  'menu.run.stop': '終了(&E)',
  'menu.run.showRuntime': 'アプリケーションを手前に表示(&F)',

  // Tools menu
  'menu.tools.addProcedure': 'プロシージャの追加(&A)...',
  'menu.tools.procedureAttributes': 'プロシージャの属性(&P)...',
  'menu.tools.menuEditor': 'メニュー エディタ(&M)...',
  'menu.tools.components': 'コンポーネント(&O)...',
  'menu.tools.references': '参照設定(&R)...',
  'menu.tools.options': 'オプション(&O)...',
  'menu.tools.virtualFiles': '仮想ファイル システム(&V)...',

  // Window menu
  'menu.window.cascade': '重ねて表示(&C)',
  'menu.window.tileHorizontal': '水平に並べて表示(&H)',
  'menu.window.tileVertical': '垂直に並べて表示(&V)',
  'menu.window.tile': 'コードとデザイナを並べて表示(&T)',
  'menu.window.closeAll': 'すべてのウィンドウを閉じる(&A)',
  'menu.window.resetLayout': 'ウィンドウ配置のリセット(&R)',
  'menu.window.fullScreen': '全画面表示(&F)',

  // Help menu
  'menu.help.help': '目次とキーボード操作(&C)',
  'menu.help.samples': 'サンプル プロジェクト(&S)...',
  'menu.help.compatibility': '言語およびランタイムのサポート(&L)',
  'menu.help.about': 'バージョン情報(&A)...',

  // Toolbar Tooltips
  'tool.new': '新規プロジェクト (Ctrl+N)',
  'tool.open': 'プロジェクトを開く (Ctrl+O)',
  'tool.save': 'プロジェクトの保存 (Ctrl+S)',
  'tool.cut': '切り取り (Ctrl+X)',
  'tool.copy': 'コピー (Ctrl+C)',
  'tool.paste': '貼り付け (Ctrl+V)',
  'tool.undo': '元に戻す (Ctrl+Z)',
  'tool.redo': 'やり直し (Ctrl+Shift+Z)',
  'tool.run': '開始 / 続行 (F5)',
  'tool.pause': '中断 (Ctrl+Break)',
  'tool.stop': '終了 (Shift+F5)',
  'tool.stepInto': 'ステップ イン (F8)',
  'tool.viewCode': 'コードの表示 (F7)',
  'tool.viewForm': 'オブジェクトの表示 (Shift+F7)',
  'tool.projectExplorer': 'プロジェクト エクスプローラ (Ctrl+R)',
  'tool.properties': 'プロパティ ウィンドウ (F4)',
  'tool.objectBrowser': 'オブジェクト ブラウザ (F2)',
  'tool.find': '検索 (Ctrl+F)',
  'tool.exportHTML': '単一 HTML アプリケーションの作成',
  'tool.zoom': 'デザイナのズーム',

  // Dock panels & tools
  'panel.toolbox': 'ツールボックス',
  'panel.toolbox.general': '標準',
  'panel.toolbox.controls': '拡張',
  'panel.toolbox.all': 'すべて',

  'panel.project': 'プロジェクト - ',
  'panel.project.forms': 'フォーム',
  'panel.project.modules': '標準モジュール',
  'panel.project.classes': 'クラス モジュール',
  'panel.project.viewCode': 'コードの表示',
  'panel.project.viewForm': 'オブジェクトの表示',
  'panel.project.toggleFolders': 'フォルダの切り替え',

  'panel.properties': 'プロパティ - ',
  'panel.properties.alphabetic': 'アルファベット順',
  'panel.properties.categorized': '項目別',
  'panel.properties.pages': 'プロパティ ページ…',

  'panel.layout': 'フォーム レイアウト',
  'panel.layout.tooltip': 'ドラッグしてフォームの起動位置を変更します',

  // Debug Tabs
  'debug.immediate': 'イミディエイト',
  'debug.locals': 'ローカル',
  'debug.watch': 'ウォッチ',
  'debug.callStack': '呼び出し履歴',
  'debug.breakpoints': 'ブレークポイント',
  'debug.errors': 'エラー一覧',
  'debug.output': '出力',

  // Property categories
  'prop.cat.Appearance': '外観',
  'prop.cat.Behavior': '動作',
  'prop.cat.Position': '位置',
  'prop.cat.Layout': '配置',
  'prop.cat.Misc': 'その他',
  'prop.cat.Data': 'データ',

  // Controls (Toolbox)
  'control.Pointer': 'ポインタ',
  'control.PictureBox': 'ピクチャ ボックス',
  'control.Label': 'ラベル',
  'control.TextBox': 'テキスト ボックス',
  'control.Frame': 'フレーム',
  'control.CommandButton': 'コマンド ボタン',
  'control.CheckBox': 'チェック ボックス',
  'control.OptionButton': 'オプション ボタン',
  'control.ComboBox': 'コンボ ボックス',
  'control.ListBox': 'リスト ボックス',
  'control.HScrollBar': '水平スクロール バー',
  'control.VScrollBar': '垂直スクロール バー',
  'control.Timer': 'タイマー',
  'control.DriveListBox': 'ドライブ リスト ボックス',
  'control.DirListBox': 'ディレクトリ リスト ボックス',
  'control.FileListBox': 'ファイル リスト ボックス',
  'control.Shape': '図形',
  'control.Line': '直線',
  'control.Image': 'イメージ',
  'control.Data': 'データ',
  'control.OLE': 'OLE',

  // Standard Dialogs
  'dialog.ok': 'OK',
  'dialog.cancel': 'キャンセル',
  'dialog.close': '閉じる',
  'dialog.apply': '適用',
  'dialog.help': 'ヘルプ',

  // New Project Dialog
  'dialog.newProject.title': '新しいプロジェクト',
  'dialog.newProject.tabNew': '新規',
  'dialog.newProject.tabExisting': '既存のファイル',
  'dialog.newProject.tabRecent': '最近使ったファイル',
  'dialog.newProject.standardExe': '標準 EXE',
  'dialog.newProject.standardExeDesc': '通常のフォームベースのブラウザー アプリケーションです。',
  'dialog.newProject.open': '開く',

  // Options Dialog
  'dialog.options.title': 'オプション',
  'dialog.options.tabEditor': 'エディタ',
  'dialog.options.tabFormat': 'エディタの書式',
  'dialog.options.tabGeneral': '全般',
  'dialog.options.tabDocking': 'ドッキング',
  'dialog.options.tabRendering': 'レンダリング',
  'dialog.options.codeSettings': 'コードの設定',
  'dialog.options.autoSyntaxCheck': '自動構文チェック',
  'dialog.options.requireVariableDeclaration': '変数の宣言を強制する',
  'dialog.options.autoListMembers': 'メンバーの一覧表示',
  'dialog.options.autoQuickInfo': 'クイック ヒント',
  'dialog.options.autoDataTips': 'データ ヒント',
  'dialog.options.autoIndent': '自動インデント',
  'dialog.options.tabWidth': 'タブ間隔: ',
  'dialog.options.windowSettings': 'ウィンドウの設定',
  'dialog.options.dragText': 'ドラッグ＆ドロップ編集',
  'dialog.options.fullModule': '常にモジュール全体を表示',
  'dialog.options.procedureSeparators': 'プロシージャの区切り線',
  'dialog.options.codeColors': 'コードの色',
  'dialog.options.font': 'フォント: ',
  'dialog.options.size': 'サイズ: ',
  'dialog.options.margin': '余白インジケーター バー',
  'dialog.options.lineNumbers': '行番号を表示 (ブラウザー拡張)',
  'dialog.options.showGrid': 'グリッドの表示',
  'dialog.options.snapToGrid': 'コントロールをグリッドに合わせる',
  'dialog.options.gridSize': 'グリッド間隔 (twips): ',
  'dialog.options.tooltips': 'ヒントを表示',
  'dialog.options.ideTheme': 'IDE テーマ: ',
  'dialog.options.appTheme': 'アプリケーション テーマ: '
};

export const PROPERTY_DESCRIPTIONS_JA = {
  Name: 'コード内でオブジェクトを識別するために使用される名前を取得または設定します。',
  Caption: 'オブジェクトのタイトル バーや、オブジェクトの横または下に表示されるテキストを取得または設定します。',
  Left: 'オブジェクトの左端とコンテナの左端との間の距離 (twip 単位) を取得または設定します。',
  Top: 'オブジェクトの上端とコンテナの上端との間の距離 (twip 単位) を取得または設定します。',
  Width: 'オブジェクトの幅 (twip 単位) を取得または設定します。',
  Height: 'オブジェクトの高さ (twip 単位) を取得または設定します。',
  ClientWidth: 'フォームのクライアント領域の幅 (twip 単位) です。',
  ClientHeight: 'フォームのクライアント領域の高さ (twip 単位) です。',
  TabIndex: '親フォーム内でのオブジェクトのタブ オーダーを取得または設定します。',
  TabStop: 'ユーザーが TAB キーを押したときにオブジェクトがフォーカスを受け取れるかどうかを取得または設定します。',
  Index: 'コントロール配列要素の整数インデックスです。通常のコントロールでは空白のままにします。',
  Text: 'コントロールに含まれるテキストを取得または設定します。',
  List: 'リストの初期項目です (1 行に 1 項目)。',
  Interval: 'タイマー イベントの間隔 (ミリ秒単位) を取得または設定します。0 にすると無効になります。',
  BackColor: 'オブジェクトのテキストやグラフィックの表示に使用される背景色を取得または設定します。',
  ForeColor: 'オブジェクトのテキストやグラフィックの表示に使用される前景色を取得または設定します。',
  Font: 'テキストの表示に使用されるフォントです。展開して個々の属性を編集します。',
  FontName: 'フォント名です。このデバイスで使用可能なフォントである必要があります。',
  FontSize: 'フォントのサイズ (ポイント単位) です。',
  FontBold: 'フォントが太字かどうかを取得または設定します。',
  FontItalic: 'フォントが斜体かどうかを取得または設定します。',
  FontUnderline: 'フォントに下線が引かれているかどうかを取得または設定します。',
  FontStrikethru: 'フォントに取り消し線が引かれているかどうかを取得または設定します。',
  Value: 'コントロールの現在の値を取得または設定します。',
  Visible: '実行時にコントロールが表示されるかどうかを取得または設定します。',
  Enabled: 'オブジェクトがユーザー イベントに応答できるかどうかを取得または設定します。',
  StartUpPosition: '最初に表示されるときのフォームの位置を決定します。',
  Tag: 'プログラムに必要な追加データを保存します。',
  ToolTipText: 'マウス ポインターがコントロール上にあるときに表示されるツール ヒント テキストを取得または設定します。',
  WindowState: '実行時のフォーム ウィンドウの表示状態 (標準、最小化、最大化) を取得または設定します。',
  BorderStyle: 'オブジェクトの境界線のスタイルを取得または設定します。',
  Appearance: 'オブジェクトが立体表示 (3D) か平面表示 (フラット) かを取得または設定します。',
  Alignment: 'テキストの配置方法 (左揃え、右揃え、中央揃え) を取得または設定します。'
};

export function t(key, fallback = '') {
  if (currentLocale === 'ja' && Object.hasOwn(JA, key)) {
    return JA[key];
  }
  return fallback;
}

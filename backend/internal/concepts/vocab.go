package concepts

// Concept は概念タグの英語句（CLIP 埋め込み・検索用）と日本語ラベル（表示用）のペア。
type Concept struct {
	En string
	Ja string
}

// Vocabulary は curated な概念語彙（約95語）。
// En = EVA02-L/14 の学習分布に合わせた英語句（CLIP 埋め込み用）。
// Ja = UI 表示用の日本語ラベル（翻訳は固定・機械翻訳なし）。
var Vocabulary = []Concept{
	// ---- 画風 ----
	{"anime art style", "アニメ画風"},
	{"digital painting", "デジタルペインティング"},
	{"watercolor painting", "水彩画"},
	{"oil painting", "油絵"},
	{"pencil sketch", "鉛筆スケッチ"},
	{"pixel art", "ドット絵"},
	{"3D rendered art", "3DCG"},
	{"line art", "線画"},
	{"concept art", "コンセプトアート"},
	{"photorealistic", "フォトリアリスティック"},
	{"flat design illustration", "フラットデザイン"},
	{"low poly art", "ローポリ"},

	// ---- 被写体・場所 ----
	{"fantasy landscape", "幻想的な風景"},
	{"urban cityscape at night", "夜の都市景観"},
	{"ocean and seascape", "海の景色"},
	{"forest and nature", "森と自然"},
	{"mountain scenery", "山の景色"},
	{"sky and clouds", "空と雲"},
	{"outer space and stars", "宇宙と星"},
	{"ancient ruins and temple", "古代の遺跡"},
	{"cozy interior room", "居心地のよい室内"},
	{"underwater and deep sea", "水中・深海"},
	{"desert landscape", "砂漠の風景"},
	{"snowy winter scene", "雪景色・冬"},
	{"flower garden", "花と庭園"},
	{"rainy day and puddle reflection", "雨の反射"},
	{"abstract geometric shapes", "抽象的な形"},
	{"volcanic and lava", "火山と溶岩"},
	{"village and countryside", "村と田舎"},

	// ---- キャラクター ----
	{"anime girl", "アニメ女性キャラ"},
	{"anime boy", "アニメ男性キャラ"},
	{"warrior in armor", "戦士・鎧"},
	{"mage casting magic spell", "魔法使い"},
	{"ninja or samurai", "忍者・侍"},
	{"elf or fairy", "エルフ・妖精"},
	{"demon or monster", "悪魔・モンスター"},
	{"school uniform student", "学生・制服"},
	{"idol singer and performer", "アイドル・パフォーマー"},
	{"cute animal", "かわいい動物"},
	{"dragon", "ドラゴン"},
	{"mecha and robot", "メカ・ロボット"},
	{"angel and divine being", "天使・神聖な存在"},
	{"cute chibi character", "ちびキャラ"},

	// ---- ジャンル・世界観 ----
	{"cyberpunk futuristic city", "サイバーパンク都市"},
	{"high fantasy magic world", "ハイファンタジー"},
	{"science fiction space opera", "SF・スペースオペラ"},
	{"steampunk mechanical", "スチームパンク"},
	{"medieval fantasy", "中世ファンタジー"},
	{"post-apocalyptic wasteland", "廃墟・終末世界"},
	{"japanese traditional aesthetics", "日本的な美意識"},
	{"mythological divine", "神話・神聖"},
	{"gothic horror dark", "ゴシック・ホラー"},
	{"slice of life everyday", "日常・スライスオブライフ"},
	{"military and war", "ミリタリー・戦争"},
	{"fairy tale magical", "おとぎ話・魔法"},

	// ---- 雰囲気・感情 ----
	{"dark and moody atmosphere", "ダークな雰囲気"},
	{"peaceful and serene", "穏やかで静か"},
	{"vibrant and energetic", "鮮やかでエネルギッシュ"},
	{"dreamy and surreal", "夢幻的・シュール"},
	{"melancholic and lonely", "もの悲しい・孤独"},
	{"mysterious and ethereal", "神秘的・幽玄"},
	{"epic and cinematic", "壮大で映画的"},
	{"cozy and warm atmosphere", "温かみとくつろぎ"},
	{"nostalgic and retro", "ノスタルジック・レトロ"},
	{"romantic and beautiful", "ロマンティックで美しい"},
	{"cute and adorable", "キュートでかわいい"},
	{"intense and dramatic", "緊迫感・ドラマチック"},
	{"hopeful and uplifting", "希望に満ちた明るさ"},

	// ---- 色・光 ----
	{"warm golden sunset colors", "暖色・ゴールデンアワー"},
	{"cool blue and purple tones", "寒色系・青紫"},
	{"monochrome black and white", "モノクロ・白黒"},
	{"soft pastel colors", "ソフトなパステル"},
	{"vivid neon lights", "ネオンカラー"},
	{"high contrast dark background", "ハイコントラスト・黒背景"},
	{"rainbow and colorful", "レインボー・カラフル"},
	{"soft glowing light bokeh", "柔らかい光のボケ"},
	{"deep red and crimson", "深紅・クリムゾン"},
	{"green nature and emerald", "グリーン・自然色"},
	{"golden hour magic light", "マジックアワーの光"},

	// ---- 視覚要素・効果 ----
	{"cherry blossom sakura", "桜"},
	{"moon and night sky", "月夜"},
	{"fire and flames", "炎"},
	{"glowing particles and sparkles", "光の粒子・輝き"},
	{"flowing hair in wind", "なびく髪"},
	{"foggy and misty", "霧・霞"},
	{"silhouette against sky", "空に映えるシルエット"},
	{"grand architecture building", "壮大な建築物"},
	{"minimalist clean design", "ミニマリスト"},
	{"detailed intricate patterns", "細密な模様"},
	{"magical glowing effects", "魔法の光エフェクト"},
	{"dynamic action pose", "ダイナミックなアクション"},
	{"wide angle panoramic view", "ワイドパノラマ"},
	{"symmetrical composition", "シンメトリー構図"},
}

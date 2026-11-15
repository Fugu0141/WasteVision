// Display-only translations: the SDK's canonical machine-readable keys stay English.
const JA=Object.freeze({
  bottle:"ボトル",cup:"カップ","wine glass":"ワイングラス",
  fork:"フォーク",knife:"ナイフ",spoon:"スプーン",bowl:"ボウル",
  book:"本",umbrella:"傘","cell phone":"スマートフォン",
  laptop:"ノートパソコン",keyboard:"キーボード",mouse:"マウス",
  "potted plant":"鉢植え",scissors:"はさみ",toothbrush:"歯ブラシ",
  handbag:"バッグ",backpack:"リュック",suitcase:"スーツケース",
  banana:"バナナ",apple:"リンゴ",orange:"オレンジ",
  broccoli:"ブロッコリー",carrot:"ニンジン",sandwich:"サンドイッチ",
  pizza:"ピザ",donut:"ドーナツ",cake:"ケーキ",
  person:"人",chair:"椅子",couch:"ソファ",car:"自動車",
  bicycle:"自転車",motorcycle:"バイク",truck:"トラック",
  bus:"バス",train:"電車",refrigerator:"冷蔵庫",
  microwave:"電子レンジ",oven:"オーブン",toaster:"トースター",
  sink:"シンク",clock:"時計",vase:"花瓶",remote:"リモコン",
  "dining table":"テーブル",tv:"テレビ",teddy:"ぬいぐるみ"
});
export function getObjectDisplayName(object,locale="ja"){
  if(typeof object!=="string")return "unknown";
  return locale==="ja"?(JA[object.toLowerCase()]??object):object;
}

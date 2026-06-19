import type { ProductFacts } from "./productFacts.js";

export interface HashtagSourceProduct {
  sku?: string;
  title_ja?: string;
  category?: string;
  materials?: string[];
  verified_selling_points?: string[];
  usage_scenes?: string[];
}

export interface HashtagSourceScript {
  voiceover?: string;
  subtitleLines?: string[];
  cta?: string;
}

export function generateJapaneseHashtags(input: {
  product: ProductFacts | HashtagSourceProduct;
  script?: HashtagSourceScript;
  limit?: number;
  variantKey?: string;
}): string[] {
  const product = input.product;
  const limit = input.limit ?? 8;
  const haystack = [
    product.title_ja,
    product.category,
    ...(product.materials ?? []),
    ...(product.verified_selling_points ?? []),
    ...(product.usage_scenes ?? []),
    input.script?.voiceover,
    ...(input.script?.subtitleLines ?? [])
  ].join(" ");
  const candidates = [
    ...categoryHashtags(haystack),
    ...sceneHashtags(haystack),
    ...sellingPointHashtags(haystack),
    "#TikTokShop",
    ...titleHashtags(product.title_ja),
    "#便利グッズ",
    "#暮らしのアイデア"
  ];
  const base = uniqueHashtags(candidates);
  if (!input.variantKey) {
    return base.slice(0, limit);
  }

  const core = uniqueHashtags([
    ...base.slice(0, Math.min(4, limit)),
    "#TikTokShop"
  ]).slice(0, limit);
  const discovery = uniqueHashtags([
    ...base.slice(core.length),
    "#便利アイテム",
    "#買ってよかった",
    "#日用品おすすめ",
    "#暮らしを整える",
    "#省スペース術",
    "#おすすめ商品",
    "#生活雑貨"
  ]);
  return uniqueHashtags([...core, ...rotateHashtags(discovery, input.variantKey)]).slice(0, limit);
}

export function normalizeJapaneseHashtags(values: unknown, fallback: string[] = []): string[] {
  const raw = Array.isArray(values) ? values : fallback;
  return uniqueHashtags(raw.map((value) => typeof value === "string" ? value : ""));
}

function categoryHashtags(text: string): string[] {
  const tags: string[] = [];
  if (/(収納|收纳|整理|ボックス|ケース|ラック|棚)/i.test(text)) tags.push("#収納グッズ", "#省スペース");
  if (/(キッチン|台所|調理|料理|食器|弁当)/i.test(text)) tags.push("#キッチン用品", "#キッチン収納");
  if (/(財布|カード|小銭|コイン|ウォレット)/i.test(text)) tags.push("#財布", "#ミニ財布");
  if (/(バッグ|ポーチ|トート|リュック)/i.test(text)) tags.push("#バッグ", "#お出かけグッズ");
  if (/(ペット|犬|猫)/i.test(text)) tags.push("#ペット用品");
  if (/(掃除|クリーニング|洗濯)/i.test(text)) tags.push("#掃除グッズ");
  if (/(美容|メイク|コスメ|スキンケア)/i.test(text)) tags.push("#美容グッズ");
  if (/(スマホ|スマートフォン|携帯|充電|ケーブル)/i.test(text)) tags.push("#スマホグッズ");
  if (/(車|カー|ドライブ)/i.test(text)) tags.push("#車内グッズ");
  if (/(旅行|トラベル|出張)/i.test(text)) tags.push("#旅行グッズ");
  if (/(防寒|暖か|あったか|冬)/i.test(text)) tags.push("#防寒グッズ");
  if (/(冷感|ひんやり|夏|UV)/i.test(text)) tags.push("#夏グッズ");
  return tags;
}

function sceneHashtags(text: string): string[] {
  const tags: string[] = [];
  if (/(一人暮らし|ひとり暮らし)/i.test(text)) tags.push("#一人暮らし");
  if (/(洗面所|バスルーム|浴室)/i.test(text)) tags.push("#洗面所収納");
  if (/(クローゼット|衣類|服)/i.test(text)) tags.push("#クローゼット収納");
  if (/(玄関|靴|シューズ)/i.test(text)) tags.push("#玄関収納");
  if (/(デスク|机|オフィス|仕事)/i.test(text)) tags.push("#デスク周り");
  if (/(子育て|キッズ|子供|こども)/i.test(text)) tags.push("#子育てグッズ");
  return tags;
}

function sellingPointHashtags(text: string): string[] {
  const tags: string[] = [];
  if (/(折りたたみ|折り畳み|コンパクト)/i.test(text)) tags.push("#コンパクト");
  if (/(省スペース|すっきり|スッキリ)/i.test(text)) tags.push("#省スペース");
  if (/(時短|簡単|かんたん|手軽)/i.test(text)) tags.push("#時短グッズ");
  if (/(持ち運び|携帯|軽量)/i.test(text)) tags.push("#持ち運び便利");
  if (/(大容量|たっぷり)/i.test(text)) tags.push("#大容量");
  if (/(かわいい|可愛い)/i.test(text)) tags.push("#かわいい");
  return tags;
}

function titleHashtags(title?: string): string[] {
  if (!title) return [];
  const compact = title
    .replace(/[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9ー]+/gu, "")
    .trim();
  if (!compact || compact.length < 2 || compact.length > 18) {
    return [];
  }
  return [`#${compact}`];
}

function uniqueHashtags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = normalizeHashtag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function rotateHashtags(values: string[], key: string): string[] {
  const tags = uniqueHashtags(values);
  if (tags.length <= 1) {
    return tags;
  }
  const offset = stableHash(key) % tags.length;
  return [...tags.slice(offset), ...tags.slice(0, offset)];
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeHashtag(value: string): string {
  const body = value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[、。，,.!！?？:：;；"“”'‘’()[\]{}<>]/g, "");
  if (!body) {
    return "";
  }
  return `#${body}`;
}

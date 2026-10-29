// What Sakin Mart sells — used ONLY to add a line under recipe posts like
// "🛒 এই রেসিপির চাল, ডাল, তেল পাবেন Sakin Mart Bangladesh-এ".
// List short Bangla words that appear in recipe ingredients (e.g. 'চাল', 'ডাল',
// 'তেল', 'চিনি', 'গুড়', 'দুধ', 'সেমাই', 'মসলা', 'পেঁয়াজ', 'আলু', 'ডিম').
// Leave the list EMPTY to show no shop line at all.
export const SHOP_PRODUCTS = [];

/** Products from the list that this recipe uses (order of the list). */
export function shopMatches(ingredients, products = SHOP_PRODUCTS) {
  const text = ingredients.join(' ');
  return products.filter((p) => p && text.includes(p));
}

export function shopLine(ingredients, pageName, products = SHOP_PRODUCTS) {
  const m = shopMatches(ingredients, products).slice(0, 5);
  return m.length ? `🛒 এই রেসিপির ${m.join(', ')} পাবেন ${pageName}-এ।` : '';
}

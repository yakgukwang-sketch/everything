// 배달 관련 키워드로 자동 감지
export const DELIVERY_KEYWORDS = [
  "시켜", "배달", "주문", "인분", "그릇", "마리", "판",
  "치킨", "피자", "족발", "보쌈", "떡볶이", "짜장", "짬뽕", "탕수육",
  "제육", "삼겹살", "곱창", "냉면", "김밥", "돈까스", "초밥", "회",
  "햄버거", "분식", "중식", "한식", "일식", "양식",
  "먹고", "먹을", "배고", "야식", "점심", "저녁", "아침",
];

export const AREA_KEYWORDS = [
  "부천", "인천", "서울", "수원", "성남", "안양", "고양", "용인",
  "화성", "시흥", "광명", "의정부", "파주", "김포", "구로", "강남",
  "마포", "송파", "관악", "영등포", "동대문", "종로",
];

export function detectDelivery(query: string): boolean {
  const text = query.toLowerCase();
  return DELIVERY_KEYWORDS.some(kw => text.includes(kw));
}

export function extractArea(query: string): string {
  for (const area of AREA_KEYWORDS) {
    if (query.includes(area)) return area;
  }
  return "부천";
}

export function extractFoodType(query: string): string {
  const foods = [
    "제육볶음", "치킨", "피자", "족발", "보쌈", "떡볶이", "짜장면", "짬뽕",
    "탕수육", "삼겹살", "곱창", "냉면", "김밥", "돈까스", "초밥", "회",
    "햄버거", "분식", "라멘", "파스타", "샐러드", "커피",
  ];
  for (const food of foods) {
    if (query.includes(food)) return food;
  }
  const words = query.split(/\s+/).filter(w => w.length >= 2);
  return words[1] || words[0] || "음식";
}

export function extractBudget(query: string): number {
  const match = query.match(/(\d+)\s*만\s*원/) || query.match(/(\d{4,})\s*원/);
  if (match) {
    return match[0].includes("만") ? parseInt(match[1]) * 10000 : parseInt(match[1]);
  }
  return 50000;
}

export function extractQuantity(query: string): string {
  const match = query.match(/(\d+)\s*(인분|그릇|마리|판|개|잔)/);
  return match ? match[0] : "1인분";
}

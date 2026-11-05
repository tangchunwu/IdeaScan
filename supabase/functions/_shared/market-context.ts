/** 市场与查询合同。语言匹配只说明检索语境，不推断作者所在地。 */
export const OPPORTUNITY_TYPES = ['reassurance', 'ritual', 'festival', 'hobby', 'daily', 'workflow'] as const;
export type OpportunityType = typeof OPPORTUNITY_TYPES[number];
export interface MarketContext { country: string; countryCode: string; language: string; opportunityType?: OpportunityType; valueModel: 'utility' | 'entertainment' }
export interface ResearchQuery { intent: string; query: string; language: string; platform?: string }
const markets: Array<[string, string, string[]]> = [
  ['US','en',['united states','usa','美国']], ['CN','zh',['china','中国']], ['GB','en',['united kingdom','uk','英国']],
  ['CA','en',['canada','加拿大']], ['AU','en',['australia','澳大利亚']], ['SG','en',['singapore','新加坡']],
  ['JP','ja',['japan','日本']], ['KR','ko',['south korea','korea','韩国']], ['TH','th',['thailand','泰国']],
  ['DE','de',['germany','德国']], ['FR','fr',['france','法国']], ['IN','hi',['india','印度']],
  ['ID','id',['indonesia','印度尼西亚']], ['BR','pt',['brazil','巴西']], ['MX','es',['mexico','墨西哥']],
  ['ES','es',['spain','西班牙']], ['AE','ar',['united arab emirates','uae','阿联酋']], ['SA','ar',['saudi arabia','沙特阿拉伯']],
  ['TR','tr',['turkey','türkiye','土耳其']], ['TW','zh',['taiwan','台湾']],
];
export function resolveMarketContext(input: {country?: string; countryCode?: string; language?: string; opportunityType?: string; valueModel?: string} = {}): MarketContext {
  const country = String(input.country || '').trim().slice(0,80);
  const found = markets.find(([code,,names]) => code.toLowerCase() === (input.countryCode || country).toLowerCase() || names.includes(country.toLowerCase()));
  const countryCode = found?.[0] || (/^[A-Z]{2}$/i.test(input.countryCode || country) ? String(input.countryCode || country).toUpperCase() : '');
  const language = /^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(input.language || '') ? input.language! : found?.[1] || 'en';
  const entertainmentTypes = new Set(['reassurance','ritual','festival','hobby']);
  const valueModel = input.valueModel === 'utility' || input.valueModel === 'entertainment' ? input.valueModel : entertainmentTypes.has(String(input.opportunityType)) ? 'entertainment' : 'utility';
  return {country, countryCode, language, valueModel, ...(OPPORTUNITY_TYPES.includes(input.opportunityType as OpportunityType) ? {opportunityType:input.opportunityType as OpportunityType} : {})};
}

// 有限本地查询模板用于冷启动；未识别的主题保留原文，不声称已完成任意语言翻译。
const phrases: Record<string, [string,string,string,string,string]> = {
  en:['my experience recurring problem','subscription price paid review','free alternative how I do it','stopped using not worth paying','daily ritual sharing memories'],
  zh:['亲身经历 反复遇到','订阅 价格 付费 使用体验','免费替代 现在怎么做','不再使用 不值得付费','日常 仪式 分享 纪念'],
  ja:['体験 困った 毎回','料金 有料 サブスク 口コミ','無料 代わり 今のやり方','使わなくなった 課金 失敗','日常 習慣 願い 思い出'],
  ko:['경험 매번 불편','가격 유료 구독 후기','무료 대안 해결 방법','사용 중단 돈 아깝다','일상 소원 의식 공유'],
  th:['ประสบการณ์ ปัญหา ทุกครั้ง','ราคา สมัครสมาชิก รีวิว','ฟรี ทางเลือก วิธีทำ','เลิกใช้ ไม่คุ้ม','กิจวัตร ขอพร แบ่งปัน'],
  es:['experiencia problema recurrente','precio suscripción de pago opiniones','alternativa gratis cómo lo hago','dejé de usar no vale la pena','ritual diario compartir recuerdos'],
  pt:['experiência problema recorrente','preço assinatura pago avaliação','alternativa grátis como faço','parei de usar não vale a pena','ritual diário compartilhar lembranças'],
  de:['Erfahrung wiederkehrendes Problem','Preis Abo bezahlt Bewertung','kostenlose Alternative bisherige Lösung','nicht mehr genutzt lohnt sich nicht','Alltag Ritual Erinnerungen teilen'],
  fr:['expérience problème récurrent','prix abonnement payant avis','alternative gratuite méthode actuelle','arrêt utilisation ne vaut pas le prix','rituel quotidien partager souvenirs'],
  hi:['अनुभव बार बार समस्या','कीमत सदस्यता भुगतान समीक्षा','मुफ्त विकल्प कैसे करें','इस्तेमाल बंद पैसे की बर्बादी','दैनिक अनुष्ठान यादें साझा'],
  id:['pengalaman masalah berulang','harga langganan berbayar ulasan','alternatif gratis cara sekarang','berhenti pakai tidak sepadan','ritual harian berbagi kenangan'],
  ar:['تجربة مشكلة متكررة','سعر اشتراك مدفوع مراجعة','بديل مجاني الطريقة الحالية','توقفت عن الاستخدام لا يستحق','طقوس يومية مشاركة ذكريات'],
  tr:['deneyim tekrarlayan sorun','fiyat ücretli abonelik yorum','ücretsiz alternatif nasıl yapıyorum','kullanmayı bıraktım değmez','günlük ritüel anı paylaşma'],
};
const topics: Record<string, Record<string,string>> = {
  '黑五':{en:'Black Friday',ja:'ブラックフライデー',ko:'블랙프라이데이',es:'Black Friday'},
  '愿望':{en:'wish ritual',ja:'願い事',ko:'소원',th:'ขอพร'},
  '远征':{en:'concert travel split expenses',ja:'推し活 遠征 立替 精算',ko:'콘서트 원정 정산'},
  '宠物':{en:'pet care',ja:'ペット',ko:'반려동물',es:'mascotas',pt:'animais de estimação'},
};
export function buildMarketQueries(context: MarketContext, subject: string): ResearchQuery[] {
  const language = context.language.split('-')[0];
  const words = phrases[language] || phrases.en;
  let topic = String(subject || '').replace(/[\n\r]/g,' ').trim().slice(0,160);
  if (language !== 'zh') for (const [key, translated] of Object.entries(topics)) topic = topic.split(key).join(translated[language] || translated.en);
  if (context.valueModel === 'entertainment') {
    const entertainmentWords: Record<string,[string,string,string,string]> = { en:['repeat use return sharing identity','subscription price paid fan experience','free alternative novelty wears off','stopped using bored no longer share'], zh:['反复使用 回访 分享 身份认同','订阅 价格 付费 粉丝体验','免费替代 新鲜感消退','不再使用 无聊 不再分享'], ja:['何度も使う リピート 共有 推し活','サブスク 料金 有料 ファン体験','無料 代替 飽きる 新鮮さ','使わなくなった 飽きた 共有しない'], ko:['재사용 재방문 공유 정체성','구독 가격 유료 팬 경험','무료 대안 싫증 신선함','사용 중단 지루함 공유 안 함'] };
    const [repeatUse, sharing, payment, decay] = entertainmentWords[language] || entertainmentWords.en;
    return [['repeat_use',repeatUse],['sharing',sharing],['payment',payment],['novelty_decay',decay]].map(([intent,suffix])=>({intent,query:`${topic} ${suffix}`.trim(),language:context.language}));
  }
  const experiential = context.opportunityType === 'ritual' || context.opportunityType === 'reassurance' || context.opportunityType === 'hobby' ? words[4] : words[0];
  return [['experience',experiential],['payment',words[1]],['alternative',words[2]],['counter',words[3]]].map(([intent,suffix]) => ({intent,query:`${topic} ${suffix}`.trim(),language:context.language}));
}

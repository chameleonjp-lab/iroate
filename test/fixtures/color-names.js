// Independently reviewed expectations. Never import a production dictionary here:
// swapping blue/orange in that dictionary must fail the rendering/answer tests.
export const EXPECTED_COLOR_LABELS = {
  ja: {red:'赤',blue:'青',green:'緑',yellow:'黄',purple:'紫',pink:'ピンク',black:'黒',orange:'オレンジ'},
  en: {red:'Red',blue:'Blue',green:'Green',yellow:'Yellow',purple:'Purple',pink:'Pink',black:'Black',orange:'Orange'},
  es: {red:'Rojo',blue:'Azul',green:'Verde',yellow:'Amarillo',purple:'Morado',pink:'Rosa',black:'Negro',orange:'Naranja'},
  'pt-BR': {red:'Vermelho',blue:'Azul',green:'Verde',yellow:'Amarelo',purple:'Roxo',pink:'Rosa',black:'Preto',orange:'Laranja'},
  'zh-Hans': {red:'红色',blue:'蓝色',green:'绿色',yellow:'黄色',purple:'紫色',pink:'粉色',black:'黑色',orange:'橙色'},
  fr: {red:'Rouge',blue:'Bleu',green:'Vert',yellow:'Jaune',purple:'Violet',pink:'Rose',black:'Noir',orange:'Orange'},
  de: {red:'Rot',blue:'Blau',green:'Grün',yellow:'Gelb',purple:'Violett',pink:'Rosa',black:'Schwarz',orange:'Orange'},
  ko: {red:'빨강',blue:'파랑',green:'초록',yellow:'노랑',purple:'보라',pink:'분홍',black:'검정',orange:'주황'},
  ru: {red:'Красный',blue:'Синий',green:'Зелёный',yellow:'Жёлтый',purple:'Фиолетовый',pink:'Розовый',black:'Чёрный',orange:'Оранжевый'},
  it: {red:'Rosso',blue:'Blu',green:'Verde',yellow:'Giallo',purple:'Viola',pink:'Rosa',black:'Nero',orange:'Arancione'},
  'zh-Hant': {red:'紅色',blue:'藍色',green:'綠色',yellow:'黃色',purple:'紫色',pink:'粉紅色',black:'黑色',orange:'橙色'},
  id: {red:'Merah',blue:'Biru',green:'Hijau',yellow:'Kuning',purple:'Ungu',pink:'Merah muda',black:'Hitam',orange:'Oranye'},
  tr: {red:'Kırmızı',blue:'Mavi',green:'Yeşil',yellow:'Sarı',purple:'Mor',pink:'Pembe',black:'Siyah',orange:'Turuncu'},
  vi: {red:'Đỏ',blue:'Xanh dương',green:'Xanh lá',yellow:'Vàng',purple:'Tím',pink:'Hồng',black:'Đen',orange:'Cam'},
  th: {red:'แดง',blue:'น้ำเงิน',green:'เขียว',yellow:'เหลือง',purple:'ม่วง',pink:'ชมพู',black:'ดำ',orange:'ส้ม'}
};

const JAPANESE_QUESTION_WORDS = {red:'あか',blue:'あお',green:'みどり',yellow:'きいろ',purple:'むらさき',pink:'ぴんく',black:'くろ',orange:'おれんじ'};
export function expectedColorWord(colorId, language) {
  return (language === 'ja' ? JAPANESE_QUESTION_WORDS : EXPECTED_COLOR_LABELS[language])[colorId];
}

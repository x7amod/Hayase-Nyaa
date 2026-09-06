export const MAX_CONCURRENT_SEARCHES = 2

export const RESOLUTIONS = ['2160', '1080', '720', '540', '480']
export const RESOLUTION_P_RE = new RegExp(`\\b(?:${RESOLUTIONS.join('|')})p\\b`, 'i')
export const ANY_RESOLUTION_P_RE = /\b\d{3,4}p\d*\b/i
export const DIMENSION_RE = /\b\d{3,4}[xX]\d{3,4}\b/g
export const K_RE = /\b\d+[kK]\b/
export const BATCH_KEYWORD_RE = /\b(batch|complete|fin|全集)\b/i
export const FIN_BRACKET_RE = /\[Fin\]/i
export const SEASON_MARKER_RE = /\b(?:\d+(?:st|nd|rd|th)\s+[Ss]eason|[Ss]eason\s*0?\d|[Ss]0?\d)\b/
export const EPISODE_MARKER_RE = /\b(?:S\d{1,2}E\d{1,4}|E[Pp]?\.?\s*\d{1,4})\b|[-–]\s*(?:E[Pp]?\.?\s*)?\d{1,4}\b/i
export const BATCH_SEASON_RANGE_RE = /\b[Ss](?:eason)?\s*0?\d\b/
export const RANGE_FRAGMENT_RE = /\b0*\d{1,4}\s*(?:[-~–]|to|x|\/)\s*0*\d{1,4}\b/i
export const ROMAN_RE = /\b(XXX?IX|XXX?IV|XXX?V?I{0,3}|XXI{0,3}|XIV|XIX|XL|XLIX|X{1,3}|IV|V|VI{0,3}|IX|I{1,3})\b/g
export const CLASSIFY_RANGE_RE = /\b0*(\d{1,4})\s*(?:[-~–]|to|x|\/)\s*0*(\d{1,4})(?=\D|$)/gi
export const CLASSIFY_EP_RE = /\b(?:S\d{1,2})?[Ee][Pp]?\.?\s*0*(\d{1,4})\b/g
export const CLASSIFY_SLOT_RE = /(?:^|[\s_\-])[-]\s*0*(\d{1,4})(?=[\s_\-)\]\.,]|$)/g
export const CLASSIFY_STANDALONE_RE = /(?:^|[\s_\-])0*(\d{1,3})(?!\.\d)(?=[\s_)\]\.,]|$)/g
export const RESULT_SEASON_RE = /\b0*(\d{1,2})(?:\s*[-–]\s*(?:E|EP)?\s*\d|\s+E\d|\s+S\d{1,2}E\d)/i
export const TRAILING_NUMBER_RE = /(?:^|\s)0*(\d{1,2})\s*$/
export const TRAILING_EPISODE_RE = /[-–]\s*\d{1,2}\s*$/
export const SEASON_S_RE = /\b[Ss](?:eason)?\s*0*(\d{1,2})(?=\b|[Ee]\d)/
export const SEASON_ORDINAL_RE = /\b(\d{1,2})(?:st|nd|rd|th)\s+[Ss]eason\b/
export const TRAILING_ORDINAL_RE = /\b(\d{1,2})(?:st|nd|rd|th)\b\s*$/
export const SIZE_MULTIPLIERS = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1048576, GIB: 1073741824, TIB: 1099511627776 }

export const resolutionRegexCache = new Map()
export const batchRangeRegexCache = new Map()

export const ROMAN_MAP = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20, XXI: 21, XXII: 22, XXIII: 23, XXIV: 24, XXV: 25, XXVI: 26, XXVII: 27, XXVIII: 28, XXIX: 29, XXX: 30, XXXI: 31, XXXII: 32, XXXIII: 33, XXXIV: 34, XXXV: 35, XXXVI: 36, XXXVII: 37, XXXVIII: 38, XXXIX: 39 }

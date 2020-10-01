// very incomplete!!!
const LOCAL_TIMEZONES = [
  {
    name: 'Alaska Time',
    abbr: 'AKST',
    dstAbbr: 'AKDT',
    locale: 'America/Anchorage',
  },
  {
    name: 'Amazon Time',
    abbr: 'AMT',
    locale: 'America/Porto_Velho',
  },
  {
    name: 'Atlantic Time',
    abbr: 'AST',
    dstAbbr: 'ADT',
    locale: 'America/Moncton',
  },
  {
    name: 'Australian Central Time',
    abbr: 'ACST',
    dstAbbr: 'ACDT',
    locale: 'Australia/Adelaide',
  },
  {
    name: 'Australian Eastern Time',
    abbr: 'AEST',
    dstAbbr: 'AEDT',
    locale: 'Australia/Sydney',
  },
  {
    name: 'Australian Western Time',
    abbr: 'AWST',
    dstAbbr: 'AWDT',
    locale: 'Australia/Perth',
  },
  {
    name: 'Brasília Time',
    abbr: 'BRT',
    locale: 'America/Sao_Paolo',
  },
  {
    name: 'Central Africa Time',
    abbr: 'CAT',
    locale: 'Africa/Khartoum',
  },
  {
    name: 'Central Time',
    abbr: 'CST',
    dstAbbr: 'CDT',
    locale: 'America/Chicago',
  },
  {
    name: 'Central European Time',
    abbr: 'CET',
    dstAbbr: 'CEST',
    locale: 'Europe/Paris',
  },
  {
    name: 'China Standard Time',
    abbr: 'CHINA',
    locale: 'Asia/Shanghai',
  },
  {
    name: 'Eastern Time',
    abbr: 'EST',
    dstAbbr: 'EDT',
    locale: 'America/New_York',
  },
  {
    name: 'Eastern Africa Time',
    abbr: 'EAT',
    locale: 'Africa/Nairobi',
  },
  {
    name: 'Eastern European Time',
    abbr: 'EET',
    dstAbbr: 'EEST',
    locale: 'Europe/Athens',
  },
  {
    name: 'Greenwich Mean Time/British Summer Time',
    abbr: 'GMT',
    dstAbbr: 'BST',
    locale: 'Europe/London',
  },
  {
    name: 'Hong Kong Time',
    abbr: 'HKT',
    locale: 'Asia/Hong_Kong',
  },
  {
    name: 'Hawaii Time',
    abbr: 'HST',
    dstAbbr: 'HDT',
    locale: 'America/Honolulu',
  },
  {
    name: 'Indian Standard Time',
    abbr: 'INDIA',
    locale: 'Asia/Delhi',
  },
  {
    name: 'Israel Standard Time',
    abbr: 'IST',
    local: 'Asia/Tel_Aviv',
  },
  {
    name: 'Japan Standard Time',
    abbr: 'JST',
    locale: 'Asia/Tokyo',
  },
  {
    name: 'Mountain Time',
    abbr: 'MST',
    dstAbbr: 'MDT',
    locale: 'America/Denver',
  },
  {
    name: 'Moscow Time',
    abbr: 'MSK',
    locale: 'Europe/Moscow',
  },
  {
    name: 'New Zealand Time',
    abbr: 'NZST',
    dstAbbr: 'NZDT',
    locale: 'Pacific/Auckland',
  },
  {
    name: 'Newfoundland Time',
    abbr: 'NST',
    dstAbbr: 'NDT',
    locale: 'America/St_Johns',
  },
  {
    name: 'Pacific Time',
    abbr: 'PST',
    dstAbbr: 'PDT',
    locale: 'America/Los_Angeles',
  },
  {
    name: 'Western Africa Time',
    abbr: 'WAT',
    locale: 'Africa/Lagos',
  },
];

const EXTRA_TIMEZONES = {
  'GMT+12': 'Etc/GMT+12',
  'GMT+11': 'Etc/GMT+11',
  'GMT+10': 'Etc/GMT+10',
  'GMT+9': 'Etc/GMT+9',
  'GMT+8': 'Etc/GMT+8',
  'GMT+7': 'Etc/GMT+7',
  'GMT+6': 'Etc/GMT+6',
  'GMT+5': 'Etc/GMT+5',
  'GMT+4': 'Etc/GMT+4',
  'GMT+3': 'Etc/GMT+3',
  'GMT+2': 'Etc/GMT+2',
  'GMT+1': 'Etc/GMT+1',
  'GMT-1': 'Etc/GMT-1',
  'GMT-2': 'Etc/GMT-2',
  'GMT-3': 'Etc/GMT-3',
  'GMT-4': 'Etc/GMT-4',
  'GMT-5': 'Etc/GMT-5',
  'GMT-6': 'Etc/GMT-6',
  'GMT-7': 'Etc/GMT-7',
  'GMT-8': 'Etc/GMT-8',
  'GMT-9': 'Etc/GMT-9',
  'GMT-10': 'Etc/GMT-10',
  'GMT-11': 'Etc/GMT-11',
  'GMT-12': 'Etc/GMT-12',
  'GMT-13': 'Etc/GMT-13',
  'GMT-14': 'Etc/GMT-14',
  'UTC+12': 'Etc/GMT+12',
  'UTC+11': 'Etc/GMT+11',
  'UTC+10': 'Etc/GMT+10',
  'UTC+9': 'Etc/GMT+9',
  'UTC+8': 'Etc/GMT+8',
  'UTC+7': 'Etc/GMT+7',
  'UTC+6': 'Etc/GMT+6',
  'UTC+5': 'Etc/GMT+5',
  'UTC+4': 'Etc/GMT+4',
  'UTC+3': 'Etc/GMT+3',
  'UTC+2': 'Etc/GMT+2',
  'UTC+1': 'Etc/GMT+1',
  'UTC-1': 'Etc/GMT-1',
  'UTC-2': 'Etc/GMT-2',
  'UTC-3': 'Etc/GMT-3',
  'UTC-4': 'Etc/GMT-4',
  'UTC-5': 'Etc/GMT-5',
  'UTC-6': 'Etc/GMT-6',
  'UTC-7': 'Etc/GMT-7',
  'UTC-8': 'Etc/GMT-8',
  'UTC-9': 'Etc/GMT-9',
  'UTC-10': 'Etc/GMT-10',
  'UTC-11': 'Etc/GMT-11',
  'UTC-12': 'Etc/GMT-12',
  'UTC-13': 'Etc/GMT-13',
  'UTC-14': 'Etc/GMT-14',
};

const TIMEZONE_CODES = {
  ...makeTimezoneMapping(LOCAL_TIMEZONES),
  ...EXTRA_TIMEZONES,
};

module.exports = {
  LOCAL_TIMEZONES,
  TIMEZONE_CODES,
};

function makeTimezoneMapping(timezoneList) {
  const mapping = {};

  timezoneList.forEach(({ abbr, dstAbbr, locale }) => {
    mapping[abbr] = locale;
    if (dstAbbr) {
      mapping[dstAbbr] = locale;
    }
  });

  return mapping;
}
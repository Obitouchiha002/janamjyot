/**
 * UI strings in the language the person chose.
 *
 * The chat and the reports already answer in the chosen language — the screens
 * around them did not. Someone who picks हिंदी at first launch was reading a
 * Hindi answer inside an English page, with English buttons and English section
 * headings, which is the single thing that made the app feel unfinished.
 *
 * English is the KEY as well as the English translation, so an untranslated
 * string still renders correctly and a missing entry degrades to English rather
 * than to a blank or a raw key. That makes it safe to translate the app one
 * screen at a time.
 */
import { useEffect, useState } from "react";
import { getLang } from "./prefs";

export type Lang = "en" | "hi" | "hinglish";

/** Every translated UI string, keyed by its English text. */
const STRINGS: Record<string, { hi: string; hinglish: string }> = {
  // --- generic ---------------------------------------------------------
  "Save": { hi: "सेव करें", hinglish: "Save karein" },
  "Saved": { hi: "सेव हो गया", hinglish: "Save ho gaya" },
  "Cancel": { hi: "रद्द करें", hinglish: "Cancel" },
  "Close": { hi: "बंद करें", hinglish: "Band karein" },
  "Delete": { hi: "हटाएँ", hinglish: "Delete karein" },
  "Edit": { hi: "बदलें", hinglish: "Badlein" },
  "Back": { hi: "वापस", hinglish: "Wapas" },
  "Loading…": { hi: "लोड हो रहा है…", hinglish: "Load ho raha hai…" },
  "Try again": { hi: "फिर कोशिश करें", hinglish: "Dobara koshish karein" },
  "Something went wrong": { hi: "कुछ गड़बड़ हो गई", hinglish: "Kuch gadbad ho gayi" },
  "Today": { hi: "आज", hinglish: "Aaj" },
  "Tomorrow": { hi: "कल", hinglish: "Kal" },
  "Yesterday": { hi: "बीता कल", hinglish: "Beeta kal" },

  // --- Panchang --------------------------------------------------------
  "Panchang": { hi: "पंचांग", hinglish: "Panchang" },
  "Sunrise": { hi: "सूर्योदय", hinglish: "Sooryoday" },
  "Sunset": { hi: "सूर्यास्त", hinglish: "Sooryast" },
  "Moonrise": { hi: "चंद्रोदय", hinglish: "Chandroday" },
  "Moonset": { hi: "चंद्रास्त", hinglish: "Chandrast" },
  "Tithi": { hi: "तिथि", hinglish: "Tithi" },
  "Nakshatra": { hi: "नक्षत्र", hinglish: "Nakshatra" },
  "Yoga": { hi: "योग", hinglish: "Yoga" },
  "Karana": { hi: "करण", hinglish: "Karan" },
  "Vaar": { hi: "वार", hinglish: "Vaar" },
  "Vara (Weekday)": { hi: "वार", hinglish: "Vaar (din)" },
  "Monday": { hi: "सोमवार", hinglish: "Somvar" },
  "Tuesday": { hi: "मंगलवार", hinglish: "Mangalvar" },
  "Wednesday": { hi: "बुधवार", hinglish: "Budhvar" },
  "Thursday": { hi: "गुरुवार", hinglish: "Guruvar" },
  "Friday": { hi: "शुक्रवार", hinglish: "Shukravar" },
  "Saturday": { hi: "शनिवार", hinglish: "Shanivar" },
  "Sunday": { hi: "रविवार", hinglish: "Ravivar" },
  "Paksha": { hi: "पक्ष", hinglish: "Paksha" },
  "Choghadiya": { hi: "चौघड़िया", hinglish: "Choghadiya" },
  "Day": { hi: "दिन", hinglish: "Din" },
  "Night": { hi: "रात", hinglish: "Raat" },
  "Rahu Kaal": { hi: "राहु काल", hinglish: "Rahu kaal" },
  "Gulika Kaal": { hi: "गुलिक काल", hinglish: "Gulik kaal" },
  "Yamaganda": { hi: "यमगंड", hinglish: "Yamagand" },
  "Abhijit Muhurat": { hi: "अभिजित मुहूर्त", hinglish: "Abhijit muhurat" },
  "Auspicious": { hi: "शुभ", hinglish: "Shubh" },
  "Inauspicious": { hi: "अशुभ", hinglish: "Ashubh" },
  "Neutral": { hi: "सामान्य", hinglish: "Samanya" },
  "Festivals & Vrat": { hi: "त्योहार और व्रत", hinglish: "Tyohar aur vrat" },
  "No festival today": { hi: "आज कोई त्योहार नहीं", hinglish: "Aaj koi tyohar nahi" },
  "Now": { hi: "अभी", hinglish: "Abhi" },
  "Panchang Elements": { hi: "पंचांग के अंग", hinglish: "Panchang ke ang" },
  "Moon Sign": { hi: "चंद्र राशि", hinglish: "Chandra rashi" },
  "Inauspicious periods": { hi: "अशुभ काल", hinglish: "Ashubh kaal" },
  "Around midday — good for starting almost anything": {
    hi: "दोपहर के आसपास — लगभग कोई भी काम शुरू करने के लिए शुभ",
    hinglish: "Dopahar ke aas-paas — lagbhag koi bhi kaam shuru karne ke liye shubh",
  },
  "Green = auspicious · Amber = neutral · Red = avoid. A ✕ marks a window that falls inside Rahu Kaal, Yamaganda or Gulika — skip it even if the name looks good.": {
    hi: "हरा = शुभ · पीला = सामान्य · लाल = बचें। ✕ वाला समय राहु काल, यमगंड या गुलिक में पड़ता है — नाम अच्छा हो तब भी छोड़ दें।",
    hinglish: "Hara = shubh · Peela = samanya · Laal = bachein. ✕ wala samay Rahu kaal, Yamagand ya Gulik mein padta hai — naam accha ho tab bhi chhod dein.",
  },
  "Hora — planetary hours": { hi: "होरा — ग्रहों के घंटे", hinglish: "Hora — grahon ke ghante" },
  "Each hora is ruled by a planet — Jupiter, Venus, Mercury and Moon horas suit new work, money and talks. Day and night are each split into 12, so a hora is not exactly one hour.": {
    hi: "हर होरा का एक स्वामी ग्रह होता है — गुरु, शुक्र, बुध और चंद्र की होरा नए काम, पैसे और बातचीत के लिए अच्छी है। दिन और रात दोनों 12-12 भागों में बँटते हैं, इसलिए होरा ठीक एक घंटे की नहीं होती।",
    hinglish: "Har hora ka ek swami grah hota hai — Guru, Shukra, Budh aur Chandra ki hora naye kaam, paise aur baat-cheet ke liye acchi hai. Din aur raat dono 12-12 bhagon mein bantte hain, isliye hora theek ek ghante ki nahi hoti.",
  },
  "Today's horoscope": { hi: "आज का राशिफल", hinglish: "Aaj ka rashifal" },
  "See today's AI prediction for all 12 moon signs.": {
    hi: "बारहों राशियों के लिए आज की भविष्यवाणी देखें।",
    hinglish: "Baarhon rashiyon ke liye aaj ki bhavishyavani dekhein.",
  },
  "Show horoscope": { hi: "राशिफल दिखाएँ", hinglish: "Rashifal dikhayein" },
  "Could not load horoscope.": { hi: "राशिफल लोड नहीं हो पाया।", hinglish: "Rashifal load nahi ho paya." },
  "Network error.": { hi: "नेटवर्क में दिक्कत है।", hinglish: "Network mein dikkat hai." },
  "Search city…": { hi: "शहर खोजें…", hinglish: "Sheher dhoondein…" },
  "Astrology offers guidance, not certainty.": {
    hi: "ज्योतिष मार्गदर्शन देता है, पक्का वादा नहीं।",
    hinglish: "Jyotish margdarshan deta hai, pakka vada nahi.",
  },

  // --- Kundli matching -------------------------------------------------
  "Kundli Matching": { hi: "कुंडली मिलान", hinglish: "Kundli milan" },
  "Boy's details": { hi: "लड़के की जानकारी", hinglish: "Ladke ki jaankari" },
  "Girl's details": { hi: "लड़की की जानकारी", hinglish: "Ladki ki jaankari" },
  "Name": { hi: "नाम", hinglish: "Naam" },
  "Date of birth": { hi: "जन्म तिथि", hinglish: "Janm tithi" },
  "Time of birth": { hi: "जन्म समय", hinglish: "Janm samay" },
  "Place of birth": { hi: "जन्म स्थान", hinglish: "Janm sthan" },
  "Match kundli": { hi: "कुंडली मिलाएँ", hinglish: "Kundli milayein" },
  "Matching…": { hi: "मिलान हो रहा है…", hinglish: "Milan ho raha hai…" },
  "Total score": { hi: "कुल अंक", hinglish: "Kul ank" },
  "out of 36": { hi: "36 में से", hinglish: "36 mein se" },
  "Guna Milan": { hi: "गुण मिलान", hinglish: "Guna milan" },
  "Manglik": { hi: "मांगलिक", hinglish: "Manglik" },
  "Verdict": { hi: "निष्कर्ष", hinglish: "Nishkarsh" },
  "Choose from my kundlis": { hi: "मेरी कुंडलियों में से चुनें", hinglish: "Meri kundliyon mein se chunein" },
  "Groom": { hi: "वर", hinglish: "Ladka" },
  "Bride": { hi: "वधू", hinglish: "Ladki" },
  "Full name": { hi: "पूरा नाम", hinglish: "Pura naam" },
  "Birth time": { hi: "जन्म समय", hinglish: "Janm samay" },
  "Birth place": { hi: "जन्म स्थान", hinglish: "Janm sthan" },
  "Start typing a city…": { hi: "शहर का नाम लिखना शुरू करें…", hinglish: "Sheher ka naam likhna shuru karein…" },
  "Match Kundlis": { hi: "कुंडली मिलाएँ", hinglish: "Kundli milayein" },
  "Enter name, date and place for both (choose the place from the suggestions).": {
    hi: "दोनों के लिए नाम, तारीख़ और जगह भरें (जगह सुझावों में से चुनें)।",
    hinglish: "Dono ke liye naam, date aur jagah bharein (jagah suggestions mein se chunein).",
  },
  "Matching failed.": { hi: "मिलान नहीं हो पाया।", hinglish: "Milan nahi ho paya." },
  "Could not build the report.": { hi: "रिपोर्ट नहीं बन पाई।", hinglish: "Report nahi ban payi." },
  "Network error while building the report.": {
    hi: "रिपोर्ट बनाते समय नेटवर्क में दिक्कत आई।",
    hinglish: "Report banate samay network mein dikkat aayi.",
  },
  "Ashtakoot breakdown": { hi: "अष्टकूट विवरण", hinglish: "Ashtakoot vivran" },
  // --- dashboard, right-now ----------------------------------------------
  "Check your connection and try again.": {
    hi: "अपना इंटरनेट देखें और फिर कोशिश करें।",
    hinglish: "Apna internet dekhein aur dobara koshish karein.",
  },
  "Talk to Astrologer": { hi: "ज्योतिषी से बात करें", hinglish: "Jyotishi se baat karein" },
  "Reports": { hi: "रिपोर्ट", hinglish: "Reports" },
  "Share my Kundli": { hi: "मेरी कुंडली भेजें", hinglish: "Meri kundli bhejein" },
  "See your full day": { hi: "पूरा दिन देखें", hinglish: "Poora din dekhein" },
  "Current Dasha": { hi: "अभी की दशा", hinglish: "Abhi ki dasha" },
  "Moon Rashi": { hi: "चंद्र राशि", hinglish: "Chandra rashi" },
  "Sun Sign": { hi: "सूर्य राशि", hinglish: "Surya rashi" },
  "Next good window": { hi: "अगला अच्छा समय", hinglish: "Agla accha samay" },
  "Remind me when it opens": { hi: "शुरू होने पर याद दिलाएँ", hinglish: "Shuru hone par yaad dilayein" },
  "Check again": { hi: "फिर से देखें", hinglish: "Dobara dekhein" },
  "Couldn't check right now": { hi: "अभी जाँच नहीं हो पाई", hinglish: "Abhi jaanch nahi ho payi" },

  // --- notifications, daily guidance, remedies ---------------------------
  "Gentle reminders so you never miss your daily guidance or an important shift.": {
    hi: "हल्के-से रिमाइंडर, ताकि आपका रोज़ का मार्गदर्शन या कोई ज़रूरी बदलाव छूटे नहीं।",
    hinglish: "Halke-se reminders, taaki aapka roz ka margdarshan ya koi zaroori badlav chhoote nahi.",
  },
  "Daily guidance time": { hi: "रोज़ के मार्गदर्शन का समय", hinglish: "Roz ke margdarshan ka samay" },
  "When your morning reminder arrives": { hi: "सुबह का रिमाइंडर कब आए", hinglish: "Subah ka reminder kab aaye" },
  "Reminders are delivered on the app — install JanamJyot on your phone to receive them.": {
    hi: "रिमाइंडर ऐप पर आते हैं — पाने के लिए JanamJyot फ़ोन में इंस्टॉल करें।",
    hinglish: "Reminders app par aate hain — paane ke liye JanamJyot phone mein install karein.",
  },
  "Your personalised guidance, every morning": {
    hi: "आपके लिए बना मार्गदर्शन, हर सुबह",
    hinglish: "Aapke liye bana margdarshan, har subah",
  },
  "Dasha change alert": { hi: "दशा बदलने का अलर्ट", hinglish: "Dasha badalne ka alert" },
  "When your sub-period (antardasha) shifts": {
    hi: "जब आपकी अंतर्दशा बदले",
    hinglish: "Jab aapki antardasha badle",
  },
  "Monthly forecast": { hi: "महीने का हाल", hinglish: "Mahine ka haal" },
  "A fresh outlook on the 1st of each month": {
    hi: "हर महीने की पहली तारीख़ को नया हाल",
    hinglish: "Har mahine ki pehli tareekh ko naya haal",
  },
  "Remedy reminder": { hi: "उपाय का रिमाइंडर", hinglish: "Upay ka reminder" },
  "An evening nudge to follow your upaay": {
    hi: "शाम को उपाय याद दिलाने के लिए",
    hinglish: "Shaam ko upay yaad dilane ke liye",
  },
  "Your day, area by area": { hi: "आपका दिन, हर क्षेत्र में", hinglish: "Aapka din, har kshetra mein" },
  "Today's practical advice": { hi: "आज की काम की सलाह", hinglish: "Aaj ki kaam ki salah" },
  "Couldn't load today's guidance": { hi: "आज का मार्गदर्शन लोड नहीं हो पाया", hinglish: "Aaj ka margdarshan load nahi ho paya" },
  "Relationship": { hi: "रिश्ते", hinglish: "Rishte" },
  "Career": { hi: "करियर", hinglish: "Career" },
  "Money": { hi: "पैसा", hinglish: "Paisa" },
  "Health": { hi: "सेहत", hinglish: "Sehat" },
  "Gemstones, mantras and upaay selected from your chart.": {
    hi: "आपकी कुंडली से चुने गए रत्न, मंत्र और उपाय।",
    hinglish: "Aapki kundli se chune gaye ratna, mantra aur upay.",
  },
  "How to follow": { hi: "कैसे करें", hinglish: "Kaise karein" },
  "Mantra": { hi: "मंत्र", hinglish: "Mantra" },
  "Donate": { hi: "दान", hinglish: "Daan" },
  "General daily upaay": { hi: "रोज़ के सामान्य उपाय", hinglish: "Roz ke samanya upay" },
  "Couldn't load your remedies": { hi: "उपाय लोड नहीं हो पाए", hinglish: "Upay load nahi ho paye" },
  "Gemstone": { hi: "रत्न", hinglish: "Ratna" },
  "Deity": { hi: "देवता", hinglish: "Devta" },
  "Colour": { hi: "रंग", hinglish: "Rang" },

  // --- home (the launch layout) ------------------------------------------
  "Preparing your report": { hi: "आपकी रिपोर्ट तैयार हो रही है", hinglish: "Aapki report taiyaar ho rahi hai" },
  "Reading your birth chart": { hi: "आपकी जन्म कुंडली पढ़ी जा रही है", hinglish: "Aapki janm kundli padhi ja rahi hai" },
  "Lining up your dasha periods": { hi: "आपकी दशाओं का क्रम बनाया जा रहा है", hinglish: "Aapki dashaon ka kram banaya ja raha hai" },
  "Writing each area of your life": { hi: "जीवन के हर क्षेत्र पर लिखा जा रहा है", hinglish: "Jeevan ke har kshetra par likha ja raha hai" },
  "Checking every placement against your chart": { hi: "हर ग्रह-स्थिति आपकी कुंडली से जाँची जा रही है", hinglish: "Har grah-sthiti aapki kundli se jaanchi ja rahi hai" },
  "This usually takes under a minute. You can keep this screen open.": { hi: "आम तौर पर एक मिनट से कम लगता है। यह स्क्रीन खुली रखें।", hinglish: "Aam taur par ek minute se kam lagta hai. Ye screen khuli rakhein." },
  "Dasha": { hi: "दशा", hinglish: "Dasha" },
  "Moon": { hi: "चंद्र", hinglish: "Chandra" },
  "Good night": { hi: "शुभ रात्रि", hinglish: "Shubh ratri" },
  "Good morning": { hi: "सुप्रभात", hinglish: "Suprabhat" },
  "Good afternoon": { hi: "नमस्कार", hinglish: "Namaskar" },
  "Good evening": { hi: "शुभ संध्या", hinglish: "Shubh sandhya" },
  "'s stars,": { hi: " के सितारे,", hinglish: " ke sitare," },
  "ready for today": { hi: "आज के लिए तैयार", hinglish: "aaj ke liye taiyaar" },
  "Your kundli is saved. Open today's personalised guidance.": { hi: "आपकी कुंडली सेव है। आज का अपना मार्गदर्शन खोलें।", hinglish: "Aapki kundli save hai. Aaj ka apna margdarshan kholiye." },
  "Today's Guidance": { hi: "आज का मार्गदर्शन", hinglish: "Aaj ka margdarshan" },
  "Open Kundli": { hi: "कुंडली खोलें", hinglish: "Kundli kholein" },
  "New Kundli": { hi: "नई कुंडली", hinglish: "Nayi kundli" },
  "Your stars,": { hi: "आपके सितारे,", hinglish: "Aapke sitare," },
  "precisely read": { hi: "सटीक पढ़े हुए", hinglish: "sateek padhe hue" },
  "Precise Vedic charts, dashas and AI guidance, checked against the Swiss Ephemeris.": { hi: "सटीक वैदिक कुंडली, दशा और AI मार्गदर्शन — स्विस एफ़ेमेरिस से मिलान किया हुआ।", hinglish: "Sateek Vedic kundli, dasha aur AI margdarshan — Swiss Ephemeris se milaan kiya hua." },
  "Create New Kundli": { hi: "नई कुंडली बनाएँ", hinglish: "Nayi kundli banayein" },
  "Quick actions": { hi: "जल्दी पहुँचें", hinglish: "Jaldi pahunchein" },
  "Matching": { hi: "मिलान", hinglish: "Milan" },
  "Yogas": { hi: "योग", hinglish: "Yog" },
  "Chart yogas": { hi: "कुंडली के योग", hinglish: "Kundli ke yog" },
  "Muhurat": { hi: "मुहूर्त", hinglish: "Muhurat" },
  "Auspicious timing": { hi: "शुभ समय", hinglish: "Shubh samay" },
  "My Kundlis": { hi: "मेरी कुंडलियाँ", hinglish: "Meri kundliyan" },
  "View all": { hi: "सब देखें", hinglish: "Sab dekhein" },
  "No kundlis yet": { hi: "अभी कोई कुंडली नहीं", hinglish: "Abhi koi kundli nahi" },
  "Tap to create your first kundli": { hi: "अपनी पहली कुंडली बनाने के लिए टैप करें", hinglish: "Apni pehli kundli banane ke liye tap karein" },
  "Active": { hi: "सक्रिय", hinglish: "Active" },
  "Your day at a glance": { hi: "एक नज़र में आपका दिन", hinglish: "Ek nazar mein aapka din" },

  // --- sign in (the second screen a new person ever sees) ----------------
  "Your birth chart, read in plain words. Free to start.": {
    hi: "आपकी जन्म कुंडली, आसान भाषा में। शुरू करना मुफ़्त है।",
    hinglish: "Aapki janm kundli, aasan bhasha mein. Shuru karna free hai.",
  },
  "Welcome back — sign in to your account.": {
    hi: "वापस स्वागत है — अपने खाते में साइन इन करें।",
    hinglish: "Wapas swagat hai — apne account mein sign in karein.",
  },
  "Your free Janam Kundli in minutes": {
    hi: "आपकी मुफ़्त जन्म कुंडली, मिनटों में",
    hinglish: "Aapki free janm kundli, minton mein",
  },
  "Daily guidance made just for you": {
    hi: "रोज़ का मार्गदर्शन, सिर्फ़ आपके लिए",
    hinglish: "Roz ka margdarshan, sirf aapke liye",
  },
  "Ask an astrologer anything, in plain words": {
    hi: "ज्योतिषी से कुछ भी पूछिए, आसान भाषा में",
    hinglish: "Jyotishi se kuch bhi poochiye, aasan bhasha mein",
  },
  "Continue with Email code": { hi: "ईमेल कोड से आगे बढ़ें", hinglish: "Email code se aage badhein" },
  "Continue with email code": { hi: "ईमेल कोड से आगे बढ़ें", hinglish: "Email code se aage badhein" },
  "Sign in with your email": { hi: "अपने ईमेल से साइन इन करें", hinglish: "Apne email se sign in karein" },
  "Enter your code": { hi: "अपना कोड डालें", hinglish: "Apna code daaliye" },
  "We'll send a 6-digit code to your email. New here? This creates your account too.": {
    hi: "हम आपके ईमेल पर 6 अंकों का कोड भेजेंगे। पहली बार आए हैं? इसी से खाता भी बन जाएगा।",
    hinglish: "Hum aapke email par 6 ank ka code bhejenge. Pehli baar aaye hain? Isi se account bhi ban jayega.",
  },
  "Send code": { hi: "कोड भेजें", hinglish: "Code bhejein" },
  "We'll email you a 6-digit code — no password needed": {
    hi: "हम आपको 6 अंकों का कोड ईमेल करेंगे — पासवर्ड की ज़रूरत नहीं",
    hinglish: "Hum aapko 6 ank ka code email karenge — password ki zarurat nahi",
  },
  "6-digit code": { hi: "6 अंकों का कोड", hinglish: "6 ank ka code" },
  "Sign in": { hi: "साइन इन", hinglish: "Sign in" },
  "Sign up": { hi: "खाता बनाएँ", hinglish: "Account banayein" },
  "Verify & sign in": { hi: "जाँचें और साइन इन करें", hinglish: "Jaanch kar sign in karein" },
  "Use a different email": { hi: "दूसरा ईमेल इस्तेमाल करें", hinglish: "Dusra email istemal karein" },
  "Create account": { hi: "खाता बनाएँ", hinglish: "Account banayein" },
  "Email": { hi: "ईमेल", hinglish: "Email" },
  "Your name (new accounts only)": { hi: "आपका नाम (सिर्फ़ नए खाते के लिए)", hinglish: "Aapka naam (sirf naye account ke liye)" },
  "Password (6+ characters)": { hi: "पासवर्ड (6+ अक्षर)", hinglish: "Password (6+ akshar)" },
  "Forgot password?": { hi: "पासवर्ड भूल गए?", hinglish: "Password bhool gaye?" },
  "Reset your password": { hi: "पासवर्ड रीसेट करें", hinglish: "Password reset karein" },
  "Back to sign in": { hi: "साइन इन पर वापस", hinglish: "Sign in par wapas" },
  "By continuing you agree this app is for spiritual guidance and entertainment.": {
    hi: "आगे बढ़ने का मतलब है कि यह ऐप आध्यात्मिक मार्गदर्शन और मनोरंजन के लिए है।",
    hinglish: "Aage badhne ka matlab hai ki ye app aadhyatmik margdarshan aur manoranjan ke liye hai.",
  },
  "Code sent. Please check your email.": { hi: "कोड भेज दिया। अपना ईमेल देखें।", hinglish: "Code bhej diya. Apna email dekhein." },
  "Could not send the code.": { hi: "कोड नहीं भेजा जा सका।", hinglish: "Code nahi bhej paye." },
  "Could not verify that code.": { hi: "वह कोड जाँचा नहीं जा सका।", hinglish: "Wo code verify nahi ho paya." },
  "Could not send the reset link.": { hi: "रीसेट लिंक नहीं भेजा जा सका।", hinglish: "Reset link nahi bhej paye." },
  "If that email has an account, a reset link is on its way.": {
    hi: "अगर उस ईमेल का खाता है, तो रीसेट लिंक भेज दिया गया है।",
    hinglish: "Agar us email ka account hai, to reset link bhej diya gaya hai.",
  },
  "Something went wrong. Please try again.": {
    hi: "कुछ गड़बड़ हो गई। फिर कोशिश करें।",
    hinglish: "Kuch gadbad ho gayi. Dobara koshish karein.",
  },
  // --- new kundli form ---------------------------------------------------
  "About you": { hi: "आपके बारे में", hinglish: "Aapke baare mein" },
  "Let's read your birth chart — I'll tell you about yourself and your life in plain words. Just three quick steps.": {
    hi: "आइए आपकी जन्म कुंडली पढ़ें — आपके बारे में और आपके जीवन के बारे में आसान भाषा में बताऊँगा। बस तीन छोटे चरण।",
    hinglish: "Aaiye aapki janm kundli padhein — aapke baare mein aur aapke jeevan ke baare mein aasan bhasha mein bataunga. Bas teen chhote step.",
  },
  "Exact birth time": { hi: "ठीक-ठीक जन्म समय", hinglish: "Theek-theek janm samay" },
  "Your full name": { hi: "आपका पूरा नाम", hinglish: "Aapka pura naam" },
  "City name, e.g. Alwar": { hi: "शहर का नाम, जैसे अलवर", hinglish: "Sheher ka naam, jaise Alwar" },
  "Pick your city from the list — latitude, longitude and timezone fill in automatically.": {
    hi: "सूची में से अपना शहर चुनें — अक्षांश, देशांतर और समय-क्षेत्र अपने आप भर जाएँगे।",
    hinglish: "List mein se apna sheher chunein — latitude, longitude aur timezone apne aap bhar jayenge.",
  },
  "Pick AM/PM carefully. Birth time decides your rising sign (Lagna), so an accurate time gives a sharper reading.": {
    hi: "AM/PM ध्यान से चुनें। जन्म समय से ही लग्न तय होता है, इसलिए सही समय से पढ़ाई ज़्यादा सटीक होती है।",
    hinglish: "AM/PM dhyan se chunein. Janm samay se hi lagna tay hota hai, isliye sahi samay se reading zyada sateek hoti hai.",
  },
  "Couldn't search places. Check your connection and try again.": {
    hi: "जगह नहीं खोजी जा सकी। इंटरनेट देखकर फिर कोशिश करें।",
    hinglish: "Jagah nahi dhoondh paye. Internet dekh kar dobara koshish karein.",
  },
  "Couldn't load this kundli to edit.": {
    hi: "यह कुंडली बदलने के लिए लोड नहीं हो पाई।",
    hinglish: "Ye kundli badalne ke liye load nahi ho payi.",
  },
  "Next": { hi: "आगे", hinglish: "Aage" },
  "Date": { hi: "तिथि", hinglish: "Tithi" },
  "Time": { hi: "समय", hinglish: "Samay" },
  "Month": { hi: "महीना", hinglish: "Mahina" },
  "Year": { hi: "साल", hinglish: "Saal" },
  "Hour": { hi: "घंटा", hinglish: "Ghanta" },
  "Minute": { hi: "मिनट", hinglish: "Minute" },
  "Language": { hi: "भाषा", hinglish: "Bhasha" },
  "Gender": { hi: "लिंग", hinglish: "Gender" },
  "Male": { hi: "पुरुष", hinglish: "Purush" },
  "Female": { hi: "स्त्री", hinglish: "Stri" },
  "Other": { hi: "अन्य", hinglish: "Anya" },

  // --- charts, dasha, alerts, reports list, theme ------------------------
  "Pick a look for the whole app. Colours and text adjust automatically for contrast.": {
    hi: "पूरे ऐप के लिए एक लुक चुनें। रंग और टेक्स्ट अपने आप साफ़ दिखने के हिसाब से बदल जाते हैं।",
    hinglish: "Poore app ke liye ek look chunein. Rang aur text apne aap saaf dikhne ke hisaab se badal jaate hain.",
  },
  "Detailed AI reports, grounded in your real chart — read, listen, download as PDF or share on WhatsApp.": {
    hi: "आपकी असली कुंडली पर आधारित विस्तृत रिपोर्ट — पढ़ें, सुनें, PDF डाउनलोड करें या WhatsApp पर भेजें।",
    hinglish: "Aapki asli kundli par aadharit detailed reports — padhein, sunein, PDF download karein ya WhatsApp par bhejein.",
  },
  "The birth chart — where every planet sat at the moment you were born.": {
    hi: "जन्म कुंडली — आपके जन्म के समय हर ग्रह कहाँ था।",
    hinglish: "Janm kundli — aapke janm ke samay har grah kahan tha.",
  },
  "Full Life Report": { hi: "पूरी जीवन रिपोर्ट", hinglish: "Poori jeevan report" },
  "Seven areas — health, wealth, career, marriage, travel, business": {
    hi: "सात क्षेत्र — सेहत, धन, करियर, विवाह, यात्रा, व्यापार",
    hinglish: "Saat kshetra — sehat, dhan, career, vivah, yatra, business",
  },
  "Career & Profession": { hi: "करियर और पेशा", hinglish: "Career aur pesha" },
  "Travel & Foreign": { hi: "यात्रा और विदेश", hinglish: "Yatra aur videsh" },
  "How this marriage would actually go": {
    hi: "यह वैवाहिक जीवन असल में कैसा रहेगा",
    hinglish: "Ye shaadi asal mein kaisi rahegi",
  },
  "Three honest versions — at its best, most likely, and if the weak points are ignored — plus how you two would be together day to day, about money and about children.": {
    hi: "तीन ईमानदार रूप — सबसे अच्छा, सबसे संभावित, और कमज़ोर पक्षों को अनदेखा करने पर — साथ ही रोज़मर्रा का साथ, पैसा और संतान।",
    hinglish: "Teen imaandaar version — sabse achha, sabse sambhavit, aur kamzoriyan ignore karne par — saath mein rozmarra ka saath, paisa aur bacche.",
  },
  "Read the outlook": { hi: "आगे का चित्र पढ़ें", hinglish: "Aage ka chitra padhein" },
  "If it goes well": { hi: "अगर सब अच्छा रहा", hinglish: "Agar sab achha raha" },
  "Most likely": { hi: "सबसे संभावित", hinglish: "Sabse sambhavit" },
  "If ignored": { hi: "अगर अनदेखा किया", hinglish: "Agar ignore kiya" },
  "Right now": { hi: "अभी", hinglish: "Abhi" },
  "The periods behind it": { hi: "इसके पीछे के दौर", hinglish: "Iske peeche ke daur" },
  "In the charts": { hi: "कुंडली में", hinglish: "Kundli mein" },
  "Together": { hi: "साथ में", hinglish: "Saath mein" },
  "Emotionally": { hi: "भावनात्मक रूप से", hinglish: "Bhavnatmak roop se" },
  "Physical bond": { hi: "शारीरिक जुड़ाव", hinglish: "Sharirik judaav" },
  "Children": { hi: "संतान", hinglish: "Bacche" },
  "Business vs Job": { hi: "व्यापार बनाम नौकरी", hinglish: "Business ya naukri" },
  "Work nature, fields, growth timing": {
    hi: "काम का स्वभाव, क्षेत्र, तरक़्क़ी का समय",
    hinglish: "Kaam ka swabhav, kshetra, tarakki ka samay",
  },
  "Wealth & Finance": { hi: "धन और आर्थिक स्थिति", hinglish: "Dhan aur paisa" },
  "Income, savings, wealth periods": {
    hi: "आमदनी, बचत, धन के अनुकूल समय",
    hinglish: "Aamdani, bachat, dhan ke anukool samay",
  },
  "Marriage & Relationship": { hi: "विवाह और रिश्ते", hinglish: "Vivah aur rishte" },
  "Partner, timing, married life": {
    hi: "जीवनसाथी, समय, वैवाहिक जीवन",
    hinglish: "Jeevansathi, samay, vaivahik jeevan",
  },
  "Annual Prediction": { hi: "वार्षिक भविष्यवाणी", hinglish: "Saal bhar ki bhavishyavani" },
  "Your year ahead — the coming months": {
    hi: "आपका आने वाला साल — अगले महीने",
    hinglish: "Aapka aane wala saal — agle mahine",
  },
  "Mahadasha Deep-Dive": { hi: "महादशा विस्तार से", hinglish: "Mahadasha vistar se" },
  "Your current planetary period": {
    hi: "आपकी अभी चल रही ग्रह-दशा",
    hinglish: "Aapki abhi chal rahi grah-dasha",
  },
  "The Navamsa — your inner potential, marriage and spiritual dharma.": {
    hi: "नवांश — आपकी भीतरी क्षमता, विवाह और धर्म।",
    hinglish: "Navamsa — aapki bheetri kshamta, vivah aur dharm.",
  },
  "Navamsa": { hi: "नवांश", hinglish: "Navamsa" },
  "Birth chart": { hi: "जन्म कुंडली", hinglish: "Janm kundli" },
  "Short names": { hi: "छोटे नाम", hinglish: "Chhote naam" },
  "D9 placements": { hi: "D9 में ग्रह", hinglish: "D9 mein grah" },
  "Planetary placements": { hi: "ग्रहों की स्थिति", hinglish: "Grahon ki sthiti" },
  "Ascendant": { hi: "लग्न", hinglish: "Lagna" },
  "Couldn't load this chart": { hi: "यह कुंडली लोड नहीं हो पाई", hinglish: "Ye kundli load nahi ho payi" },
  "Vimshottari Dasha — the timing of events in your life.": {
    hi: "विंशोत्तरी दशा — आपके जीवन की घटनाओं का समय।",
    hinglish: "Vimshottari dasha — aapke jeevan ki ghatnaon ka samay.",
  },
  "Current period": { hi: "अभी चल रहा दौर", hinglish: "Abhi chal raha daur" },
  "Mahadasha": { hi: "महादशा", hinglish: "Mahadasha" },
  "Antardasha": { hi: "अंतर्दशा", hinglish: "Antardasha" },
  "Valid until:": { hi: "इस तारीख़ तक:", hinglish: "Is tareekh tak:" },
  "Upcoming Antardashas": { hi: "आगे आने वाली अंतर्दशाएँ", hinglish: "Aage aane wali antardashayein" },
  "Couldn't load your dasha": { hi: "आपकी दशा लोड नहीं हो पाई", hinglish: "Aapki dasha load nahi ho payi" },
  "Current Mahadasha": { hi: "वर्तमान महादशा", hinglish: "Abhi ki mahadasha" },
  "Current Antardasha": { hi: "वर्तमान अंतर्दशा", hinglish: "Abhi ki antardasha" },
  "Right now in the sky": { hi: "अभी आसमान में", hinglish: "Abhi aasman mein" },
  "Upcoming Antardasha periods": { hi: "आगे की अंतर्दशाएँ", hinglish: "Aage ki antardashayein" },
  "Based on your natal chart and the live sky. Astrology offers guidance, not certainty.": {
    hi: "आपकी जन्म कुंडली और अभी के आसमान से। ज्योतिष मार्गदर्शन देता है, पक्का वादा नहीं।",
    hinglish: "Aapki janm kundli aur abhi ke aasman se. Jyotish margdarshan deta hai, pakka vada nahi.",
  },
  "Couldn't load your alerts": { hi: "अलर्ट लोड नहीं हो पाए", hinglish: "Alerts load nahi ho paye" },

  // --- deep matching ---------------------------------------------------
  "What to watch": { hi: "किन बातों का ध्यान रखें", hinglish: "Kin baaton ka dhyan rakhein" },
  "Your past, period by period": { hi: "आपका बीता समय, दौर दर दौर", hinglish: "Aapka beeta samay, daur dar daur" },
  "Check the reading against a life you already lived. If these stretches match, the years ahead are worth reading.": {
    hi: "जो जीवन आप जी चुके हैं, उससे मिलाकर देखिए। ये दौर सही बैठें, तो आगे के साल पढ़ने लायक हैं।",
    hinglish: "Jo zindagi aap jee chuke hain, usse milakar dekhiye. Ye daur sahi baithein, to aage ke saal padhne layak hain.",
  },
  "Show my past": { hi: "मेरा बीता समय दिखाएँ", hinglish: "Mera beeta samay dikhayein" },
  "Reading the years you have lived…": { hi: "आपके बीते वर्ष पढ़े जा रहे हैं…", hinglish: "Aapke beete saal padhe ja rahe hain…" },
  "These are tendencies of each period, not certainties — you may have lived one of them differently. The dates are calculated from your birth moment and do not change.": {
    hi: "ये हर दौर की प्रवृत्तियाँ हैं, निश्चितता नहीं — हो सकता है आपने इन्हें अलग तरह से जिया हो। तारीख़ें आपके जन्म समय से गणना की गई हैं और बदलती नहीं।",
    hinglish: "Ye har daur ki tendencies hain, pakki baat nahi — ho sakta hai aapne inhe alag tarah se jiya ho. Tareekhein aapke janm samay se nikali gayi hain aur badalti nahi.",
  },
  "age": { hi: "उम्र", hinglish: "umar" },
  "career": { hi: "करियर", hinglish: "career" },
  "money": { hi: "पैसा", hinglish: "paisa" },
  "family": { hi: "परिवार", hinglish: "parivar" },
  "home": { hi: "घर", hinglish: "ghar" },
  "study": { hi: "पढ़ाई", hinglish: "padhai" },
  "health": { hi: "सेहत", hinglish: "sehat" },
  "relationship": { hi: "रिश्ता", hinglish: "rishta" },
  "travel": { hi: "यात्रा", hinglish: "yatra" },
  "What helps": { hi: "क्या मदद करेगा", hinglish: "Kya madad karega" },
  "Strong": { hi: "मज़बूत", hinglish: "Mazboot" },
  "Moderate": { hi: "ठीक-ठाक", hinglish: "Theek-thaak" },
  "Needs care": { hi: "ध्यान चाहिए", hinglish: "Dhyan chahiye" },
  "Marriage promise": { hi: "विवाह योग", hinglish: "Vivah yog" },
  "Moon sign": { hi: "चंद्र राशि", hinglish: "Chandra rashi" },
  "Lagna": { hi: "लग्न", hinglish: "Lagna" },
  "Lord": { hi: "स्वामी", hinglish: "Swami" },
  "7th house (D1)": { hi: "सप्तम भाव (D1)", hinglish: "7va bhav (D1)" },
  "7th house (D9)": { hi: "सप्तम भाव (D9)", hinglish: "7va bhav (D9)" },
  "difficult house": { hi: "कठिन भाव", hinglish: "kathin bhav" },
  "house": { hi: "भाव", hinglish: "bhav" },
  "Running now": { hi: "अभी चल रही दशा", hinglish: "Abhi chal rahi dasha" },
  "Ends": { hi: "समाप्त", hinglish: "Khatm" },
  "Planet": { hi: "ग्रह", hinglish: "Grah" },
  "supportive periods": { hi: "अनुकूल समय", hinglish: "anukool samay" },
  "No strongly supportive period in the next ten years.": {
    hi: "अगले दस साल में कोई ख़ास अनुकूल समय नहीं दिखता।",
    hinglish: "Agle das saal mein koi khaas anukool samay nahi dikhta.",
  },
  "cancelled": { hi: "निरस्त", hinglish: "cancel" },
  "Remedies": { hi: "उपाय", hinglish: "Upay" },
  "Ask anything about the two of you — children, money, family, work. Both charts are read together.": {
    hi: "आप दोनों के बारे में कुछ भी पूछें — बच्चे, पैसा, परिवार, काम। दोनों कुंडलियाँ साथ में पढ़ी जाती हैं।",
    hinglish: "Aap dono ke baare mein kuch bhi poochein — bacche, paisa, parivar, kaam. Dono kundliyan saath mein padhi jaati hain.",
  },
  "Reading both charts…": { hi: "दोनों कुंडलियाँ पढ़ी जा रही हैं…", hinglish: "Dono kundliyan padhi ja rahi hain…" },
  "Ask about the two of you…": { hi: "आप दोनों के बारे में पूछें…", hinglish: "Aap dono ke baare mein poochein…" },
  "How will married life look around": {
    hi: "इस साल के आसपास वैवाहिक जीवन कैसा रहेगा",
    hinglish: "Is saal ke aas-paas vaivahik jeevan kaisa rahega",
  },
  "Wedding dates for the two of you": { hi: "आप दोनों के लिए विवाह मुहूर्त", hinglish: "Aap dono ke liye vivah muhurat" },
  "Dates marked with a star are good in the panchang AND fall inside a period both charts support.": {
    hi: "तारे वाली तारीख़ें पंचांग में भी शुभ हैं और दोनों कुंडलियों के अनुकूल समय में भी पड़ती हैं।",
    hinglish: "Taare wali tareekhein panchang mein bhi shubh hain aur dono kundliyon ke anukool samay mein bhi padti hain.",
  },
  "chart-supported": { hi: "कुंडली अनुकूल", hinglish: "kundli anukool" },
  "No suitable wedding date in the months ahead — Chaturmas or Kharmas may be running.": {
    hi: "आने वाले महीनों में कोई उपयुक्त विवाह तिथि नहीं — चातुर्मास या खरमास चल रहा हो सकता है।",
    hinglish: "Aane wale mahinon mein koi upyukt vivah tithi nahi — Chaturmas ya Kharmas chal raha ho sakta hai.",
  },
  "History": { hi: "पुराने मिलान", hinglish: "Purane milan" },
  "Nothing saved yet.": { hi: "अभी कुछ सेव नहीं है।", hinglish: "Abhi kuch save nahi hai." },
  "Deep reading": { hi: "गहरा विश्लेषण", hinglish: "Gehra vishleshan" },
  "Both charts": { hi: "दोनों कुंडलियाँ", hinglish: "Dono kundliyan" },
  "All planets": { hi: "सभी ग्रह", hinglish: "Sabhi grah" },
  "Timing": { hi: "समय", hinglish: "Samay" },
  "Doshas & remedies": { hi: "दोष और उपाय", hinglish: "Dosh aur upay" },
  "Ask about this match": { hi: "इस रिश्ते के बारे में पूछें", hinglish: "Is rishte ke baare mein poochein" },
  "The year ahead": { hi: "आने वाला साल", hinglish: "Aane wala saal" },
  "Save this match": { hi: "यह मिलान सेव करें", hinglish: "Ye milan save karein" },
  "Share": { hi: "शेयर करें", hinglish: "Share karein" },
  "Ashtakoot Guna Milan — 36 point compatibility.": {
    hi: "अष्टकूट गुण मिलान — 36 अंकों की अनुकूलता।",
    hinglish: "Ashtakoot guna milan — 36 ankon ki compatibility.",
  },
  "Dosha check": { hi: "दोष जाँच", hinglish: "Dosh jaanch" },
  "Suggested remedies": { hi: "सुझाए गए उपाय", hinglish: "Sujhaye gaye upay" },
  "match": { hi: "मिलान", hinglish: "match" },
  "Couldn't create the PDF. Please try again.": {
    hi: "PDF नहीं बन पाई। कृपया फिर कोशिश करें।",
    hinglish: "PDF nahi ban payi. Dobara koshish karein.",
  },

  // --- Settings --------------------------------------------------------
  "Settings": { hi: "सेटिंग्स", hinglish: "Settings" },
  "Account": { hi: "खाता", hinglish: "Account" },
  "Reading language": { hi: "पढ़ने की भाषा", hinglish: "Padhne ki bhasha" },
  "The language the app and your readings use.": {
    hi: "ऐप और आपकी रीडिंग इसी भाषा में दिखेंगी।",
    hinglish: "App aur aapki reading isi bhasha mein dikhengi.",
  },
  "Notifications": { hi: "नोटिफिकेशन", hinglish: "Notifications" },
  "Daily guidance": { hi: "रोज़ का मार्गदर्शन", hinglish: "Roz ka margdarshan" },
  "Theme": { hi: "थीम", hinglish: "Theme" },
  "Light": { hi: "लाइट", hinglish: "Light" },
  "Dark": { hi: "डार्क", hinglish: "Dark" },
  "System": { hi: "सिस्टम", hinglish: "System" },
  "Sign out": { hi: "साइन आउट", hinglish: "Sign out" },
  "Delete my account": { hi: "मेरा खाता हटाएँ", hinglish: "Mera account delete karein" },
  "App version": { hi: "ऐप वर्ज़न", hinglish: "App version" },
  "Help & Support": { hi: "मदद और सहायता", hinglish: "Madad aur support" },

  // --- Settings screen -------------------------------------------------
  "Appearance": { hi: "रंग-रूप", hinglish: "Look aur feel" },
  "Choose a look": { hi: "एक लुक चुनें", hinglish: "Ek look chunein" },
  "Calculation Method": { hi: "गणना पद्धति", hinglish: "Ganana paddhati" },
  "Zodiac System": { hi: "राशि पद्धति", hinglish: "Rashi paddhati" },
  "Ayanamsa": { hi: "अयनांश", hinglish: "Ayanamsa" },
  "House System": { hi: "भाव पद्धति", hinglish: "Bhav paddhati" },
  "Ephemeris": { hi: "पंचांग गणना", hinglish: "Ephemeris" },
  "Every chart in JanamJyot is calculated with these classical methods, validated to sub-degree accuracy.": {
    hi: "JanamJyot की हर कुंडली इन्हीं शास्त्रीय पद्धतियों से बनती है, अंश से भी कम की सटीकता के साथ।",
    hinglish: "JanamJyot ki har kundli inhi shastriya paddhatiyon se banti hai, degree se bhi kam ki accuracy ke saath.",
  },
  "Preferences": { hi: "पसंद", hinglish: "Preferences" },
  "Reading Language": { hi: "पढ़ने की भाषा", hinglish: "Padhne ki bhasha" },
  "Default language for AI answers, reports and voice.": {
    hi: "AI के जवाब, रिपोर्ट और आवाज़ इसी भाषा में आएँगे।",
    hinglish: "AI ke jawab, report aur awaaz isi bhasha mein aayenge.",
  },
  "Reset": { hi: "रीसेट", hinglish: "Reset" },
  "Privacy & data": { hi: "प्राइवेसी और डेटा", hinglish: "Privacy aur data" },
  "App Lock": { hi: "ऐप लॉक", hinglish: "App lock" },
  "Ask for fingerprint or screen lock before opening the app": {
    hi: "ऐप खोलने से पहले फ़िंगरप्रिंट या स्क्रीन लॉक माँगे",
    hinglish: "App kholne se pehle fingerprint ya screen lock maange",
  },
  "Vibration": { hi: "कंपन", hinglish: "Vibration" },
  "When the phone should buzz": { hi: "फ़ोन कब कंपे", hinglish: "Phone kab vibrate ho" },
  "Off": { hi: "बंद", hinglish: "Band" },
  "Only key actions": { hi: "सिर्फ़ ज़रूरी कामों पर", hinglish: "Sirf zaroori kaamon par" },
  "Everything": { hi: "हर चीज़ पर", hinglish: "Har cheez par" },
  "How strongly the phone buzzes when you tap": {
    hi: "टैप करने पर फ़ोन कितना ज़ोर से कंपे",
    hinglish: "Tap karne par phone kitna zor se vibrate ho",
  },
  "Offline data": { hi: "ऑफ़लाइन डेटा", hinglish: "Offline data" },
  "Screens you open are saved so they work without internet": {
    hi: "खोली गई स्क्रीन सेव रहती हैं, ताकि बिना इंटरनेट भी खुलें",
    hinglish: "Kholi gayi screens save rehti hain, taaki bina internet bhi khulein",
  },
  "Clear": { hi: "साफ़ करें", hinglish: "Clear karein" },
  "Permanently erases your account, every saved kundli and chart, your reports, chat history and any feedback you left. This cannot be undone.": {
    hi: "आपका खाता, हर सेव की गई कुंडली, आपकी रिपोर्ट, चैट और दिया गया फ़ीडबैक हमेशा के लिए मिट जाएगा। इसे वापस नहीं लाया जा सकता।",
    hinglish: "Aapka account, har save ki gayi kundli, aapki reports, chat aur diya gaya feedback hamesha ke liye mit jayega. Ise wapas nahi laya ja sakta.",
  },
  "Delete forever": { hi: "हमेशा के लिए हटाएँ", hinglish: "Hamesha ke liye delete karein" },
  "Deleting…": { hi: "हटाया जा रहा है…", hinglish: "Delete ho raha hai…" },
  "Feedback": { hi: "फ़ीडबैक", hinglish: "Feedback" },
  "Rate & Review": { hi: "रेटिंग और राय", hinglish: "Rating aur raay" },
  "5-star rating & a quick comment": {
    hi: "5-स्टार रेटिंग और एक छोटी सी राय",
    hinglish: "5-star rating aur ek chhoti si raay",
  },
  "Disclaimer: for spiritual guidance and entertainment only. Do not rely on AI for medical diagnosis or financial planning.": {
    hi: "सूचना: यह केवल आध्यात्मिक मार्गदर्शन और मनोरंजन के लिए है। चिकित्सा या वित्तीय निर्णय के लिए AI पर निर्भर न रहें।",
    hinglish: "Soochna: ye sirf aadhyatmik margdarshan aur manoranjan ke liye hai. Medical ya financial faisle ke liye AI par bharosa na karein.",
  },
  "Privacy": { hi: "प्राइवेसी", hinglish: "Privacy" },
};

/** Normalised current language. Anything unknown reads as English. */
export function currentLang(): Lang {
  const l = getLang();
  return l === "hi" || l === "hinglish" ? l : "en";
}

/**
 * Translate one English string. Unknown strings come back unchanged, which is
 * what makes it safe to wrap a screen before every line of it is translated.
 */
export function translate(text: string, lang: Lang = currentLang()): string {
  if (lang === "en") return text;
  return STRINGS[text]?.[lang] ?? text;
}

/**
 * `const t = useT()` — then `t("Sunrise")`. Re-renders when the language
 * changes, so switching it in Settings updates open screens without a reload.
 */
export function useT(): (text: string) => string {
  const [lang, setLangState] = useState<Lang>(currentLang);
  useEffect(() => {
    const onChange = () => setLangState(currentLang());
    window.addEventListener("jj:lang", onChange);
    return () => window.removeEventListener("jj:lang", onChange);
  }, []);
  return (text: string) => translate(text, lang);
}

/** Intl locale for the chosen language. Hinglish reads Roman, so it uses en-IN. */
export function localeOf(lang: Lang = currentLang()): string {
  return lang === "hi" ? "hi-IN" : "en-IN";
}

/**
 * A date a person can read, in their language.
 *
 * "Saturday, 2026-09-12" is a database row, not a date — it was on the Panchang
 * header, and it is the kind of thing that makes an app feel like a debug
 * build. The weekday goes through the dictionary rather than Intl so Hinglish
 * gets "Shanivar" instead of either "Saturday" or "शनिवार".
 */
export function formatDate(
  input: string | Date,
  lang: Lang = currentLang(),
  opts: { weekday?: boolean; year?: boolean } = { weekday: true, year: true },
): string {
  const d = input instanceof Date ? input : new Date(`${String(input).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return String(input);
  const day = d.toLocaleDateString(localeOf(lang), {
    day: "numeric",
    month: "long",
    ...(opts.year === false ? {} : { year: "numeric" }),
  });
  if (opts.weekday === false) return day;
  const wdEn = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${translate(wdEn, lang)}, ${day}`;
}

/** The weekday name alone, in the chosen language. */
export function weekdayName(input: string | Date, lang: Lang = currentLang()): string {
  const d = input instanceof Date ? input : new Date(`${String(input).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return String(input);
  return translate(d.toLocaleDateString("en-US", { weekday: "long" }), lang);
}

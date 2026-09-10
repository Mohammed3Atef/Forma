/* @ds-bundle: {"format":3,"namespace":"MyRockyDesignSystem_e382a9","components":[],"sourceHashes":{"ui_kits/app/MobileLongevity.jsx":"a856c5d5cb47","ui_kits/website/BiomarkerRail.jsx":"a6749b2d174f","ui_kits/website/Hero.jsx":"03b24ec52efc","ui_kits/website/MeasureReverse.jsx":"c8806f323a76","ui_kits/website/Nav.jsx":"2bbc342fad7c","ui_kits/website/PartnerBanner.jsx":"0433cf5d2947","ui_kits/website/Pricing.jsx":"484b593a2101","ui_kits/website/Protocol.jsx":"6774e1b940df","ui_kits/website/Sections.jsx":"a436580de395","ui_kits/website/StatsNad.jsx":"d96657fdba3b","ui_kits/website/Ticker.jsx":"e9cf20264456"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MyRockyDesignSystem_e382a9 = window.MyRockyDesignSystem_e382a9 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/app/MobileLongevity.jsx
try { (() => {
// MobileLongevity.jsx — MyRocky Longevity landing page, mobile (dark), 407px wide.
// Figma: node 27196:4424.

const Arrow = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 10 10",
  fill: "currentColor"
}, /*#__PURE__*/React.createElement("path", {
  d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
}));
const Check = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M20 6L9 17l-5-5"
}));
const Clock = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "10"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 6v6l4 2"
}));
const Shield = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
}));
const Home = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V11z"
}));
const Stars = () => /*#__PURE__*/React.createElement("span", {
  className: "mob-stars"
}, "\u2605\u2605\u2605\u2605\u2605");
function PartnerTicker() {
  // Scrolling partner list, duplicated for seamless loop
  const items = [{
    team: 'NBA'
  }, {
    team: 'Toronto Blue Jays'
  }, {
    team: 'Toronto Maple Leafs'
  }, {
    team: 'Toronto Argonauts'
  }, {
    team: 'Toronto FC'
  }];
  const loop = [...items, ...items];
  return /*#__PURE__*/React.createElement("div", {
    className: "mob-partners"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-partners-track"
  }, loop.map((item, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i === 0 && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "mob-partner-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pp-label"
  }, "Proud Partner")), /*#__PURE__*/React.createElement("div", {
    className: "mob-partner-sep"
  })), /*#__PURE__*/React.createElement("span", {
    className: "mob-partner-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mob-partner-badge"
  }, item.team.split(' ').map(w => w[0]).join('').slice(0, 2)), item.team), /*#__PURE__*/React.createElement("div", {
    className: "mob-partner-sep"
  })))));
}
function Nav() {
  return /*#__PURE__*/React.createElement("div", {
    className: "mob-nav"
  }, /*#__PURE__*/React.createElement("img", {
    className: "logo",
    src: "../../assets/logos/myrocky-wordmark-twotone-dark.svg",
    alt: "myrocky"
  }), /*#__PURE__*/React.createElement("button", {
    className: "mob-nav-btn",
    "aria-label": "menu"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "14",
    viewBox: "0 0 18 14",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1h16M1 7h16M1 13h16"
  }))));
}
function Hero({
  headline
}) {
  const [h1, h2] = headline;
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-hero"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "mob-h1"
  }, h1, " ", /*#__PURE__*/React.createElement("em", null, h2))), /*#__PURE__*/React.createElement("p", {
    className: "mob-lede"
  }, "Every year without data is a year of guessing. Get your true biological age, 43 biomarkers analyzed, and a personalized plan to turn back the clock."), /*#__PURE__*/React.createElement("div", {
    className: "mob-ctas"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mob-btn primary"
  }, "buy your test now ", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("button", {
    className: "mob-btn ghost"
  }, "see how it works")), /*#__PURE__*/React.createElement("div", {
    className: "mob-trust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-trust-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-avatars"
  }, /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: 'linear-gradient(135deg,#AE7E56,#c4915f)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: 'linear-gradient(135deg,#2E5D3C,#4a7d5b)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: 'linear-gradient(135deg,#3d3d30,#5a5a45)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "av",
    style: {
      background: 'linear-gradient(135deg,#BF6E4E,#d48a6a)'
    }
  })), /*#__PURE__*/React.createElement(Stars, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      color: 'rgba(255,255,255,0.9)'
    }
  }, "Join 5,875+ people living healthier lives"), /*#__PURE__*/React.createElement("div", {
    className: "mob-trust-dot-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "item"
  }, /*#__PURE__*/React.createElement(Check, null), " Doctor-reviewed results"), /*#__PURE__*/React.createElement("span", {
    className: "item"
  }, /*#__PURE__*/React.createElement(Clock, null), " Results in 1\u20132 weeks"))));
}
function PressTicker() {
  const brands = ['Bloomberg', 'Forbes', 'Yahoo', 'Business Insider'];
  return /*#__PURE__*/React.createElement("div", {
    className: "mob-press"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mob-press-lbl"
  }, "As seen in"), brands.map(b => /*#__PURE__*/React.createElement("span", {
    key: b,
    className: "mob-press-brand"
  }, b)));
}
function Protocol() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-proto"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mob-proto-pill"
  }, "\u2022 The Rocky Protocol"), /*#__PURE__*/React.createElement("h2", null, "Measure your age. Then ", /*#__PURE__*/React.createElement("em", null, "reverse it.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-age-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-age-card chron"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Chronological"), /*#__PURE__*/React.createElement("div", {
    className: "big"
  }, "41"), /*#__PURE__*/React.createElement("div", {
    className: "cap"
  }, "Your passport age.", /*#__PURE__*/React.createElement("br", null), "Fixed. Guessed at.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-age-card bio"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Biological"), /*#__PURE__*/React.createElement("div", {
    className: "big"
  }, "34"), /*#__PURE__*/React.createElement("div", {
    className: "cap"
  }, "Your cellular age.", /*#__PURE__*/React.createElement("br", null), "Measured. Changeable."))), /*#__PURE__*/React.createElement("p", null, "We measure 43 biomarkers across cardiovascular, metabolic, inflammation and hormones \u2014 then use a validated aging algorithm to calculate your true biological age."));
}
function Duo() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-duo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-duo-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eye"
  }, "01 \xB7 Measure  \u2192  02 \xB7 Reverse"), /*#__PURE__*/React.createElement("h2", null, "The ", /*#__PURE__*/React.createElement("em", null, "two-step"), " longevity stack")), /*#__PURE__*/React.createElement("div", {
    className: "mob-duo-card measure"
  }, /*#__PURE__*/React.createElement("div", {
    className: "img-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "01 \xB7 Measure"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Measure"), /*#__PURE__*/React.createElement("p", null, "A blood test that measures 43 key biomarkers using a validated aging algorithm."))), /*#__PURE__*/React.createElement("div", {
    className: "mob-duo-card reverse"
  }, /*#__PURE__*/React.createElement("div", {
    className: "img-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "02 \xB7 Reverse"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Reverse"), /*#__PURE__*/React.createElement("p", null, "NAD+ injection to restore cellular energy, DNA repair, and recovery."))));
}
function Stats() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-stats-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eye"
  }, "The data"), /*#__PURE__*/React.createElement("h2", null, "Your age is just a number. ", /*#__PURE__*/React.createElement("em", null, "The rest matters."))), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-n"
  }, "43"), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-t"
  }, "Biomarkers analyzed"), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-d"
  }, "Cardiovascular, metabolic, inflammatory, and hormonal health in one draw.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-n"
  }, "12+"), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-t"
  }, "Health systems scored"), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-d"
  }, "From cellular aging to cognitive performance and recovery.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-n"
  }, "2\u20139"), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-t"
  }, "Years reversed on average"), /*#__PURE__*/React.createElement("div", {
    className: "mob-stat-d"
  }, "After 12 months of following the Rocky Protocol, members lower their biological age by 2\u20139 years.")));
}
function NadChart() {
  // NAD+ decline curve
  const pts = "40,40 80,55 120,75 160,100 200,130 240,160 280,180";
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-nad"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-nad-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mob-nad-inner"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eye"
  }, "NAD+ decay"), /*#__PURE__*/React.createElement("h2", null, "Your body runs on NAD+. And it's running out."), /*#__PURE__*/React.createElement("p", null, "By age 50, NAD+ levels drop by ~50%. That's why energy, DNA repair and recovery all slow down. We restore it directly.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-nad-chart"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-nad-lbl y"
  }, "NAD+ level"), /*#__PURE__*/React.createElement("div", {
    className: "mob-nad-lbl x"
  }, "Age \u2192"), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 320 220",
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("g", {
    stroke: "rgba(230,226,220,0.1)",
    strokeWidth: "1"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "30",
    y1: "30",
    x2: "30",
    y2: "200"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "30",
    y1: "200",
    x2: "310",
    y2: "200"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "30",
    y1: "100",
    x2: "310",
    y2: "100",
    strokeDasharray: "2 4"
  })), /*#__PURE__*/React.createElement("path", {
    d: `M 30,200 L ${pts} L 310,200 Z`.replace(pts, pts),
    fill: "url(#nadGrad)",
    opacity: "0.35"
  }), /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "nadGrad",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#AE7E56",
    stopOpacity: "0.6"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#AE7E56",
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("polyline", {
    fill: "none",
    stroke: "#AE7E56",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    points: pts
  }), /*#__PURE__*/React.createElement("g", {
    fill: "rgba(230,226,220,0.55)",
    fontFamily: "DM Mono, monospace",
    fontSize: "9"
  }, /*#__PURE__*/React.createElement("text", {
    x: "40",
    y: "216"
  }, "20"), /*#__PURE__*/React.createElement("text", {
    x: "120",
    y: "216"
  }, "40"), /*#__PURE__*/React.createElement("text", {
    x: "200",
    y: "216"
  }, "60"), /*#__PURE__*/React.createElement("text", {
    x: "280",
    y: "216"
  }, "80")), /*#__PURE__*/React.createElement("circle", {
    cx: "160",
    cy: "100",
    r: "5",
    fill: "#AE7E56",
    stroke: "#000",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("text", {
    x: "170",
    y: "96",
    fill: "#AE7E56",
    fontFamily: "DM Mono, monospace",
    fontSize: "10"
  }, "\u221250%")))));
}
function Pricing() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-pricing"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-pricing-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mob-pricing-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-pricing-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eye"
  }, "longevity program"), /*#__PURE__*/React.createElement("h2", null, "One plan, two shots at a longer life."), /*#__PURE__*/React.createElement("p", null, "Cancel anytime. Doctor-reviewed. Delivered to your door.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-price-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-price-card pop"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mob-price-tag"
  }, "Most popular"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "mob-price-ti"
  }, "Longevity Program"), /*#__PURE__*/React.createElement("p", {
    className: "mob-price-desc"
  }, "Full bloodwork + NAD+ protocol")), /*#__PURE__*/React.createElement("div", {
    className: "mob-price-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mob-price-big"
  }, "$389"), /*#__PURE__*/React.createElement("span", {
    className: "mob-price-per"
  }, "/ month"), /*#__PURE__*/React.createElement("span", {
    className: "mob-price-was"
  }, "$520"), /*#__PURE__*/React.createElement("span", {
    className: "mob-price-save"
  }, "save 25%")), /*#__PURE__*/React.createElement("ul", {
    className: "mob-price-list"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " At-home blood test, 43 biomarkers"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " Biological age report + quarterly retest"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " NAD+ injection, 4 \xD7 monthly"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " 1:1 with a longevity practitioner")), /*#__PURE__*/React.createElement("button", {
    className: "mob-btn copper"
  }, "start your protocol ", /*#__PURE__*/React.createElement(Arrow, null))), /*#__PURE__*/React.createElement("div", {
    className: "mob-price-card"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "mob-price-ti"
  }, "Test-only"), /*#__PURE__*/React.createElement("p", {
    className: "mob-price-desc"
  }, "Measure, then decide.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-price-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mob-price-big"
  }, "$249"), /*#__PURE__*/React.createElement("span", {
    className: "mob-price-per"
  }, "one-time")), /*#__PURE__*/React.createElement("ul", {
    className: "mob-price-list"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " At-home blood test, 43 biomarkers"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " Biological age report"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement(Check, null), " Doctor review within 1\u20132 weeks")), /*#__PURE__*/React.createElement("button", {
    className: "mob-btn ghost"
  }, "just the test ", /*#__PURE__*/React.createElement(Arrow, null))))));
}
const BIOMARKERS = [{
  cat: 'Cardiovascular',
  mk: 'ApoB',
  ds: 'The most accurate single predictor of heart disease risk.',
  img: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&auto=format&fit=crop&q=60'
}, {
  cat: 'Metabolic',
  mk: 'HbA1c',
  ds: 'Three-month average of blood sugar, a key diabetes indicator.',
  img: 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=600&auto=format&fit=crop&q=60'
}, {
  cat: 'Inflammation',
  mk: 'hs-CRP',
  ds: 'Tracks chronic inflammation — a root driver of aging.',
  img: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=600&auto=format&fit=crop&q=60'
}, {
  cat: 'Hormones',
  mk: 'Testosterone',
  ds: 'Critical for mood, muscle mass, libido and recovery.',
  img: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&auto=format&fit=crop&q=60'
}, {
  cat: 'Kidney',
  mk: 'Cystatin-C',
  ds: 'Sensitive marker of kidney function and aging.',
  img: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=600&auto=format&fit=crop&q=60'
}];
function BioRail() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-bio"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-bio-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eye"
  }, "43 biomarkers, one clear picture"), /*#__PURE__*/React.createElement("h2", null, "What we ", /*#__PURE__*/React.createElement("em", null, "measure."))), /*#__PURE__*/React.createElement("div", {
    className: "mob-bio-rail"
  }, BIOMARKERS.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "mob-bio-tile",
    style: {
      backgroundImage: `url(${b.img})`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cat"
  }, b.cat), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mk"
  }, b.mk), /*#__PURE__*/React.createElement("div", {
    className: "ds"
  }, b.ds))))));
}
function Steps() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-steps"
  }, /*#__PURE__*/React.createElement("h2", null, "How it ", /*#__PURE__*/React.createElement("em", null, "works")), /*#__PURE__*/React.createElement("p", {
    className: "mob-steps-sub"
  }, "Three simple steps from curiosity to a personalized plan."), /*#__PURE__*/React.createElement("div", {
    className: "mob-steps-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-step-media",
    style: {
      background: 'linear-gradient(135deg,#1a1a1a,#3d3d30)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, "01 \xB7 Order"), /*#__PURE__*/React.createElement("h3", null, "Order your test"), /*#__PURE__*/React.createElement("p", null, "A pain-free at-home blood collection kit arrives within 2 business days.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-step-media",
    style: {
      backgroundImage: 'url(../website/assets/step2-questionnaire.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, "02 \xB7 Fill in"), /*#__PURE__*/React.createElement("h3", null, "Tell us about you"), /*#__PURE__*/React.createElement("p", null, "A 4-minute lifestyle questionnaire refines your personalized protocol.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-step"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-step-media",
    style: {
      background: 'linear-gradient(135deg,#AE7E56,#3d3d30)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, "03 \xB7 Reverse"), /*#__PURE__*/React.createElement("h3", null, "Start your plan"), /*#__PURE__*/React.createElement("p", null, "Receive your biological age report and NAD+ injections at your door."))));
}
const TESTIMONIALS = [{
  from: 42,
  to: 36,
  name: 'Marcus',
  loc: 'Toronto, ON',
  q: 'After six months I have more energy at 42 than I did at 32. The data kept me honest.'
}, {
  from: 38,
  to: 31,
  name: 'Priya',
  loc: 'Vancouver, BC',
  q: 'The NAD+ shots and the quarterly retest are the only routine I\'ve actually kept.'
}, {
  from: 51,
  to: 44,
  name: 'James',
  loc: 'Montreal, QC',
  q: 'I finally understand what\'s happening in my body instead of guessing at supplements.'
}];
function Testimonials() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-testi"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eye"
  }, "results"), /*#__PURE__*/React.createElement("h2", null, "Thousands have reversed their ", /*#__PURE__*/React.createElement("em", null, "true age.")), /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-rail"
  }, TESTIMONIALS.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "mob-testi-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-ages"
  }, /*#__PURE__*/React.createElement("span", {
    className: "from"
  }, t.from), /*#__PURE__*/React.createElement("span", {
    className: "to"
  }, t.to), /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "bio age")), /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-change"
  }, "\u25BC ", t.from - t.to, " years reversed"), /*#__PURE__*/React.createElement("p", {
    className: "mob-testi-q"
  }, "\"", t.q, "\""), /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-avatar"
  }, t.name[0]), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-name"
  }, t.name), /*#__PURE__*/React.createElement("div", {
    className: "mob-testi-loc"
  }, t.loc)))))));
}
function FinalCta() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mob-final"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mob-final-card"
  }, /*#__PURE__*/React.createElement("h2", null, "Your true age ", /*#__PURE__*/React.createElement("em", null, "is waiting.")), /*#__PURE__*/React.createElement("button", {
    className: "mob-btn primary"
  }, "buy your test now ", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("div", {
    className: "mob-final-trust"
  }, /*#__PURE__*/React.createElement("span", {
    className: "item"
  }, /*#__PURE__*/React.createElement(Check, null), " Doctor-reviewed results"), /*#__PURE__*/React.createElement("span", {
    className: "item"
  }, /*#__PURE__*/React.createElement(Shield, null), " HIPAA-compliant & private"), /*#__PURE__*/React.createElement("span", {
    className: "item"
  }, /*#__PURE__*/React.createElement(Home, null), " Delivered to your door"))));
}
function Footer() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "mob-footer"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/myrocky-wordmark-twotone.svg",
    alt: "myrocky"
  }));
}
function MobileLongevity({
  headline = ['Your body is aging.', 'Now you can measure it.']
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mob",
    "data-screen-label": "01 longevity-mobile"
  }, /*#__PURE__*/React.createElement(PartnerTicker, null), /*#__PURE__*/React.createElement(Nav, null), /*#__PURE__*/React.createElement(Hero, {
    headline: headline
  }), /*#__PURE__*/React.createElement(PressTicker, null), /*#__PURE__*/React.createElement(Protocol, null), /*#__PURE__*/React.createElement(Duo, null), /*#__PURE__*/React.createElement(Stats, null), /*#__PURE__*/React.createElement(NadChart, null), /*#__PURE__*/React.createElement(Pricing, null), /*#__PURE__*/React.createElement(BioRail, null), /*#__PURE__*/React.createElement(Steps, null), /*#__PURE__*/React.createElement(Testimonials, null), /*#__PURE__*/React.createElement(FinalCta, null), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  MobileLongevity
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/MobileLongevity.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/BiomarkerRail.jsx
try { (() => {
// Biomarker carousel — white bg, horizontal scroll
function BiomarkerRail() {
  const tiles = [{
    cat: 'Cardiovascular',
    mk: 'ApoB',
    ds: 'The true marker of heart-attack risk — more accurate than LDL.',
    bg: 'linear-gradient(135deg,#8b2a2a,#2a0a0a)'
  }, {
    cat: 'Metabolic',
    mk: 'HbA1c',
    ds: 'Three-month average blood-sugar. A direct line to metabolic age.',
    bg: 'linear-gradient(135deg,#3d3d30,#1a1a10)'
  }, {
    cat: 'Inflammation',
    mk: 'hs-CRP',
    ds: 'Silent inflammation — the upstream driver of chronic disease.',
    bg: 'linear-gradient(135deg,#5a3520,#2a1a10)'
  }, {
    cat: 'Metabolic',
    mk: 'Fasting insulin',
    ds: 'Catches insulin resistance years before glucose moves.',
    bg: 'linear-gradient(135deg,#2E5D3C,#14281e)'
  }, {
    cat: 'Hormonal',
    mk: 'Testosterone',
    ds: 'Free + total. Strength, recovery, cognition.',
    bg: 'linear-gradient(135deg,#AE7E56,#3d2a1a)'
  }, {
    cat: 'Micronutrient',
    mk: 'Vitamin D',
    ds: 'Immune, bone, mood. ~30% of Canadians are deficient.',
    bg: 'linear-gradient(135deg,#4a5d2a,#1a2010)'
  }, {
    cat: 'Liver',
    mk: 'ALT / AST',
    ds: 'The earliest signal of fatty-liver and oxidative stress.',
    bg: 'linear-gradient(135deg,#614530,#1f1510)'
  }, {
    cat: 'Kidney',
    mk: 'eGFR',
    ds: 'Filtration rate — your kidney\'s biological age in one number.',
    bg: 'linear-gradient(135deg,#2a4a5a,#0a1a28)'
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-bio"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-bio-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-eye"
  }, "what we measure"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-bio-h"
  }, "43 biomarkers. One clear picture.")), /*#__PURE__*/React.createElement("div", {
    className: "mr-bio-nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mr-bio-arrow first",
    "aria-label": "prev"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    width: "10",
    height: "10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  }))), /*#__PURE__*/React.createElement("button", {
    className: "mr-bio-arrow",
    "aria-label": "next"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    width: "10",
    height: "10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "mr-bio-rail"
  }, tiles.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.mk,
    className: "mr-bio-tile",
    style: {
      background: t.bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cat"
  }, t.cat), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mk"
  }, t.mk), /*#__PURE__*/React.createElement("div", {
    className: "ds"
  }, t.ds))))));
}
window.BiomarkerRail = BiomarkerRail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/BiomarkerRail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Hero.jsx
try { (() => {
// Hero — dark, full-bleed runner bg at 54% black, copy-led
function Hero() {
  const Arrow = () => /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  }));
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-eyebrow-pill"
  }, "The Rocky Protocol"), /*#__PURE__*/React.createElement("h1", {
    className: "mr-hero-h1"
  }, "Your body is aging. ", /*#__PURE__*/React.createElement("em", null, "Now you can measure it.")), /*#__PURE__*/React.createElement("p", {
    className: "mr-hero-sub"
  }, "A single at-home blood draw. 43 biomarkers, your biological age, and a personalized plan \u2014 reviewed by Canadian practitioners."), /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-ctas"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn primary-light"
  }, "buy your test now ", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("button", {
    className: "btn outline-light"
  }, "see how it works")), /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-trust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-trust-item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-hero-stars"
  }, "\u2605\u2605\u2605\u2605\u2605"), /*#__PURE__*/React.createElement("span", null, "Join ", /*#__PURE__*/React.createElement("b", null, "5,875+"), " people")), /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-trust-item"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6L9 17l-5-5"
  })), /*#__PURE__*/React.createElement("span", null, "Doctor-reviewed")), /*#__PURE__*/React.createElement("div", {
    className: "mr-hero-trust-item"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 6v6l4 2"
  })), /*#__PURE__*/React.createElement("span", null, "Results in 1\u20132 weeks")))));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/MeasureReverse.jsx
try { (() => {
// Measure / Reverse 2-card system with vial + NAD+ imagery
function MeasureReverse() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-duo"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-duo-eye"
  }, "how it works"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-duo-h"
  }, "Two steps. ", /*#__PURE__*/React.createElement("em", null, "One new baseline."))), /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-card measure"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-img"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-num"
  }, "01 \xB7 Measure"), /*#__PURE__*/React.createElement("h3", {
    className: "mr-duo-t"
  }, "A single blood draw reveals your ", /*#__PURE__*/React.createElement("em", null, "true"), " biological age."), /*#__PURE__*/React.createElement("p", {
    className: "mr-duo-d"
  }, "43 biomarkers from one at-home collection kit. Ships free, results in 1\u20132 weeks.")), /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-card reverse"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-img"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mr-duo-num"
  }, "02 \xB7 Reverse"), /*#__PURE__*/React.createElement("h3", {
    className: "mr-duo-t"
  }, "NAD+ therapy, built around your ", /*#__PURE__*/React.createElement("em", null, "report.")), /*#__PURE__*/React.createElement("p", {
    className: "mr-duo-d"
  }, "Your practitioner matches therapy and lifestyle to the specific biomarkers that moved your age up."))));
}
window.MeasureReverse = MeasureReverse;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/MeasureReverse.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Nav.jsx
try { (() => {
function Nav({
  scrolled
}) {
  const links = [{
    t: 'Longevity',
    active: true
  }, {
    t: 'Hair loss'
  }, {
    t: 'Sexual health'
  }, {
    t: 'Weight loss'
  }, {
    t: 'Supplements'
  }, {
    t: 'Science'
  }];
  return /*#__PURE__*/React.createElement("nav", {
    className: `mr-nav ${scrolled ? 'scrolled' : ''}`
  }, /*#__PURE__*/React.createElement("a", {
    className: "mr-logo",
    href: "#",
    "aria-label": "myrocky home"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/myrocky-wordmark-twotone-dark.svg",
    alt: "myrocky",
    style: {
      height: 28,
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "mr-links"
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l.t,
    href: "#",
    className: `mr-link ${l.active ? 'active' : ''}`
  }, l.t))), /*#__PURE__*/React.createElement("div", {
    className: "mr-nav-right"
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "search",
    className: "mr-icon"
  }), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "user",
    className: "mr-icon"
  }), /*#__PURE__*/React.createElement("i", {
    "data-lucide": "shopping-cart",
    className: "mr-icon"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn primary-light small"
  }, "Get started", /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  })))));
}
window.Nav = Nav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Nav.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/PartnerBanner.jsx
try { (() => {
function PartnerBanner() {
  const teams = ['NBA', 'Toronto Blue Jays', 'Toronto Maple Leafs', 'Toronto Argonauts'];
  return /*#__PURE__*/React.createElement("div", {
    className: "partner-banner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pp-label"
  }, "PROUD PARTNER"), teams.map(t => /*#__PURE__*/React.createElement(React.Fragment, {
    key: t
  }, /*#__PURE__*/React.createElement("span", {
    className: "pp-sep"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pp-team"
  }, t))));
}
window.PartnerBanner = PartnerBanner;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/PartnerBanner.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Pricing.jsx
try { (() => {
// Pricing — runner bg, 2 cards, best-value outlined right
function Pricing() {
  const Arrow = () => /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  }));
  const Check = () => /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6L9 17l-5-5"
  }));
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-pricing"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-pricing-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mr-pricing-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-pricing-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-pricing-eye"
  }, "simple pricing"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-pricing-h"
  }, "Longevity Program"), /*#__PURE__*/React.createElement("p", {
    className: "mr-pricing-sub"
  }, "Why spend $1,000+ for a single specialist consultation? Get more comprehensive data, starting at $299.")), /*#__PURE__*/React.createElement("div", {
    className: "mr-price-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-price-card"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "mr-price-ti"
  }, "Longevity Program"), /*#__PURE__*/React.createElement("p", {
    className: "mr-price-desc"
  }, "Clear answers about your health."), /*#__PURE__*/React.createElement("div", {
    className: "mr-price-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-price-big"
  }, "$299"), /*#__PURE__*/React.createElement("span", {
    className: "mr-price-per"
  }, "/ per test"))), /*#__PURE__*/React.createElement("ul", {
    className: "mr-price-list"
  }, /*#__PURE__*/React.createElement("li", {
    className: "check"
  }, /*#__PURE__*/React.createElement(Check, null), "43 biomarkers tested"), /*#__PURE__*/React.createElement("li", {
    className: "check"
  }, /*#__PURE__*/React.createElement(Check, null), "Biological age score"), /*#__PURE__*/React.createElement("li", {
    className: "check"
  }, /*#__PURE__*/React.createElement(Check, null), "Dedicated practitioner"), /*#__PURE__*/React.createElement("li", {
    className: "check"
  }, /*#__PURE__*/React.createElement(Check, null), "Personalized report")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    className: "btn outline-light full"
  }, "get my results ", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("div", {
    className: "mr-price-foot",
    style: {
      marginTop: 14
    }
  }, "That's less than $7 per biomarker analyzed"))), /*#__PURE__*/React.createElement("div", {
    className: "mr-price-card pop"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-price-tag"
  }, "best value"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "mr-price-ti"
  }, "Longevity Program +"), /*#__PURE__*/React.createElement("p", {
    className: "mr-price-desc"
  }, "Full program plus NAD+ injections."), /*#__PURE__*/React.createElement("div", {
    className: "mr-price-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-price-big"
  }, "$399"), /*#__PURE__*/React.createElement("span", {
    className: "mr-price-was"
  }, "$499"), /*#__PURE__*/React.createElement("span", {
    className: "mr-price-save"
  }, "Save $100"))), /*#__PURE__*/React.createElement("ul", {
    className: "mr-price-list"
  }, /*#__PURE__*/React.createElement("li", {
    className: "check"
  }, /*#__PURE__*/React.createElement(Check, null), "Everything in Longevity Program"), /*#__PURE__*/React.createElement("li", {
    style: {
      paddingLeft: 28,
      color: 'rgba(255,255,255,0.78)',
      fontSize: 14,
      lineHeight: 1.6
    }
  }, "43 biomarkers \xB7 Biological age score \xB7 Dedicated practitioner \xB7 Personalized report"), /*#__PURE__*/React.createElement("li", {
    className: "check"
  }, /*#__PURE__*/React.createElement(Check, null), "NAD+ Injections included")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    className: "btn copper full"
  }, "upgrade to + ", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("div", {
    className: "mr-price-foot",
    style: {
      marginTop: 14
    }
  }, "HSA / FSA eligible \xB7 Free shipping"))))));
}
window.Pricing = Pricing;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Pricing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Protocol.jsx
try { (() => {
// Protocol editorial — white, pill + big headline + 43 vs 34 card comparison
function Protocol() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-protocol"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-protocol-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-protocol-pill"
  }, "The Rocky Protocol"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-protocol-h"
  }, "Measure your age. ", /*#__PURE__*/React.createElement("em", null, "Then reverse it.")), /*#__PURE__*/React.createElement("p", {
    className: "mr-protocol-body"
  }, "Your chronological age is a number on your driver's licence. Your biological age is what your cells actually think. We measure the second \u2014 and give you the plan to move it."), /*#__PURE__*/React.createElement("div", {
    className: "mr-protocol-compare"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-age-card chron"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Chronological"), /*#__PURE__*/React.createElement("div", {
    className: "big"
  }, "43"), /*#__PURE__*/React.createElement("div", {
    className: "cap"
  }, "Your date of birth")), /*#__PURE__*/React.createElement("div", {
    className: "mr-age-card bio"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lbl"
  }, "Biological"), /*#__PURE__*/React.createElement("div", {
    className: "big"
  }, "34"), /*#__PURE__*/React.createElement("div", {
    className: "cap"
  }, "What your cells say \xB7 9 years younger"))), /*#__PURE__*/React.createElement("div", {
    className: "mr-bio-bars"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip on"
  }, "Cardiovascular"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip on"
  }, "Metabolic"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip on"
  }, "Inflammation"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip"
  }, "Hormonal"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip"
  }, "Liver function"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip"
  }, "Kidney function"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip"
  }, "Micronutrients"), /*#__PURE__*/React.createElement("span", {
    className: "mr-bio-chip"
  }, "Thyroid"))));
}
window.Protocol = Protocol;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Protocol.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Sections.jsx
try { (() => {
// 3-step order flow
function OrderSteps() {
  const steps = [{
    n: '01',
    t: 'Order your test',
    d: 'Ships free to your door within 2 business days. HSA/FSA eligible.',
    media: null,
    icon: 'package'
  }, {
    n: '02',
    t: 'Tell us about your health',
    d: 'A 5-minute questionnaire and a single at-home blood draw — or a requisition at any LifeLabs.',
    media: 'step2-questionnaire.png'
  }, {
    n: '03',
    t: 'Get your results',
    d: '43 biomarkers + your biological-age score + a plan, reviewed by a Canadian practitioner.',
    media: null,
    icon: 'file-text'
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-steps"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "mr-steps-h"
  }, "From blood draw to biological age \u2014 ", /*#__PURE__*/React.createElement("em", null, "in two weeks.")), /*#__PURE__*/React.createElement("p", {
    className: "mr-steps-sub"
  }, "A simple, doctor-reviewed process. No subscriptions, no surprises."), /*#__PURE__*/React.createElement("div", {
    className: "mr-steps-grid"
  }, steps.map(s => /*#__PURE__*/React.createElement("div", {
    className: "mr-step",
    key: s.n
  }, /*#__PURE__*/React.createElement("div", {
    className: `mr-step-media ${s.media ? 'img' : ''}`,
    style: s.media ? {
      backgroundImage: `url('./assets/${s.media}')`
    } : {}
  }, !s.media && /*#__PURE__*/React.createElement("i", {
    "data-lucide": s.icon,
    style: {
      width: 40,
      height: 40,
      color: 'var(--copper)',
      opacity: 0.6
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mr-step-n"
  }, "Step ", s.n), /*#__PURE__*/React.createElement("h3", {
    className: "mr-step-t"
  }, s.t), /*#__PURE__*/React.createElement("p", {
    className: "mr-step-d"
  }, s.d))))));
}

// Real results testimonials
function Testimonials() {
  const quotes = [{
    from: '38',
    to: '33',
    change: '5 years younger',
    q: "It was not vague wellness talk. Rocky showed me my fasting insulin was 14, explained exactly why that mattered, and gave me a plan. Retested at 7 three months later.",
    n: 'James P., 38',
    loc: 'Vancouver, BC',
    ini: 'jp'
  }, {
    from: '44',
    to: '41',
    change: 'Tracking progress',
    q: "My CRP dropped from 3.1 to 0.8 after following my personalized plan. Seeing my biological age drop with real numbers keeps me accountable.",
    n: 'Beatrice R., 44',
    loc: 'Calgary, AB',
    ini: 'br'
  }, {
    from: '52',
    to: '46',
    change: '6 years younger',
    q: "The report is the clearest health document I've ever been handed. My practitioner spent 40 minutes walking me through exactly what to change.",
    n: 'Marcus T., 52',
    loc: 'Toronto, ON',
    ini: 'mt'
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-testi"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-testi-eye"
  }, "real results"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-testi-h"
  }, "Thousands discovered their ", /*#__PURE__*/React.createElement("em", null, "true age.")), /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-grid"
  }, quotes.map((q, i) => /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-card",
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-ages"
  }, /*#__PURE__*/React.createElement("span", {
    className: "from"
  }, q.from), /*#__PURE__*/React.createElement("span", {
    className: "to"
  }, q.to), /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "bio age")), /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-change"
  }, "\u2713 ", q.change), /*#__PURE__*/React.createElement("p", {
    className: "mr-testi-q"
  }, "\"", q.q, "\""), /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-avatar"
  }, q.ini), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-name"
  }, q.n), /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-loc"
  }, "Verified \xB7 ", q.loc)))))), /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-cta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-testi-disc"
  }, "Individual results may vary. Biological age estimates are based on Levine's Phenotypic Age algorithm."), /*#__PURE__*/React.createElement("button", {
    className: "btn primary-dark"
  }, "join 5,875+ canadians taking control ", /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  })))));
}

// Final CTA card with runner bg
function FinalCta() {
  const Arrow = () => /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  }));
  const Check = () => /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6L9 17l-5-5"
  }));
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-final"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-final-card"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "mr-final-h"
  }, "Your body is generating data right now. ", /*#__PURE__*/React.createElement("em", null, "Are you capturing it?")), /*#__PURE__*/React.createElement("button", {
    className: "btn primary-light"
  }, "get my results, from $299 ", /*#__PURE__*/React.createElement(Arrow, null)), /*#__PURE__*/React.createElement("div", {
    className: "mr-final-trust"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-final-trust-item"
  }, /*#__PURE__*/React.createElement(Check, null), "60-Day Clarity Guarantee"), /*#__PURE__*/React.createElement("div", {
    className: "mr-final-trust-item"
  }, /*#__PURE__*/React.createElement(Check, null), "Free Shipping"))));
}
function MRFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "mr-footer"
  }, /*#__PURE__*/React.createElement("a", {
    className: "mr-logo",
    href: "#",
    "aria-label": "myrocky home"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logos/myrocky-wordmark-twotone.svg",
    alt: "myrocky",
    style: {
      height: 36,
      display: 'block'
    }
  })));
}
window.OrderSteps = OrderSteps;
window.Testimonials = Testimonials;
window.FinalCta = FinalCta;
window.MRFooter = MRFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/StatsNad.jsx
try { (() => {
function Stats() {
  const stats = [{
    n: '43',
    t: 'biomarkers',
    d: 'Analyzed from a single at-home blood draw.'
  }, {
    n: '12+',
    t: 'years tracked',
    d: 'Average biological-age delta across our cohort.'
  }, {
    n: '2–9',
    t: 'years younger',
    d: 'Average biological-age reduction on protocol.'
  }];
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-stats-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-stats-eye"
  }, "the numbers"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-stats-h"
  }, "Your age is just a number. ", /*#__PURE__*/React.createElement("em", null, "This one matters."))), /*#__PURE__*/React.createElement("div", {
    className: "mr-stats-grid"
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    className: "mr-stat",
    key: s.n
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-stat-n"
  }, s.n), /*#__PURE__*/React.createElement("div", {
    className: "mr-stat-t"
  }, s.t), /*#__PURE__*/React.createElement("div", {
    className: "mr-stat-d"
  }, s.d)))));
}

// NAD+ decay curve
function NadDecay() {
  // Exponential-ish decline from age 20 → 80
  const W = 560,
    H = 280,
    P = 40;
  const ages = [20, 30, 40, 50, 60, 70, 80];
  const levels = ages.map(a => 100 * Math.exp(-(a - 20) / 38)); // % of baseline
  const pts = ages.map((a, i) => {
    const x = P + (a - 20) / 60 * (W - 2 * P);
    const y = H - P - levels[i] / 100 * (H - 2 * P);
    return [x, y];
  });
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ` L ${pts[pts.length - 1][0]} ${H - P} L ${pts[0][0]} ${H - P} Z`;
  return /*#__PURE__*/React.createElement("section", {
    className: "mr-nad"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mr-nad-bg"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mr-nad-inner"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "mr-nad-eye"
  }, "the aging molecule"), /*#__PURE__*/React.createElement("h2", {
    className: "mr-nad-h"
  }, "Your body runs on NAD+. ", /*#__PURE__*/React.createElement("em", null, "And it's running out.")), /*#__PURE__*/React.createElement("p", {
    className: "mr-nad-body"
  }, "By 50, you've lost more than half the NAD+ you had at 20. It's the molecule your mitochondria use to produce energy, repair DNA, and fight inflammation. Replenish it, and your cells behave younger."), /*#__PURE__*/React.createElement("button", {
    className: "btn outline-light"
  }, "read the science ", /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 10 10",
    fill: "currentColor",
    style: {
      width: 10,
      height: 10
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M 7.6 5.6 L 0 5.6 L 0 4.4 L 7.6 4.4 L 4.1 0.9 L 5 0 L 10 5 L 5 10 L 4.1 9.1 Z"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mr-nad-chart"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-nad-lbl y"
  }, "NAD+ level"), /*#__PURE__*/React.createElement("span", {
    className: "mr-nad-lbl x"
  }, "Age \u2192"), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "none"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "nadG",
    x1: "0",
    x2: "0",
    y1: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "var(--copper)",
    stopOpacity: "0.5"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "var(--copper)",
    stopOpacity: "0"
  }))), [0, 1, 2, 3].map(i => {
    const y = P + i * (H - 2 * P) / 3;
    return /*#__PURE__*/React.createElement("line", {
      key: i,
      x1: P,
      x2: W - P,
      y1: y,
      y2: y,
      stroke: "rgba(230,226,220,0.08)"
    });
  }), ages.map((a, i) => {
    const x = P + (a - 20) / 60 * (W - 2 * P);
    return /*#__PURE__*/React.createElement("text", {
      key: a,
      x: x,
      y: H - 12,
      fill: "rgba(230,226,220,0.45)",
      fontSize: "10",
      fontFamily: "DM Mono",
      textAnchor: "middle"
    }, a);
  }), /*#__PURE__*/React.createElement("path", {
    d: area,
    fill: "url(#nadG)"
  }), /*#__PURE__*/React.createElement("path", {
    d: path,
    fill: "none",
    stroke: "var(--copper)",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }), pts.map((p, i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: p[0],
    cy: p[1],
    r: "3.5",
    fill: "#000",
    stroke: "var(--copper)",
    strokeWidth: "1.5"
  })), /*#__PURE__*/React.createElement("line", {
    x1: pts[3][0],
    x2: pts[3][0],
    y1: pts[3][1],
    y2: H - P,
    stroke: "rgba(174,126,86,0.3)",
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement("text", {
    x: pts[3][0] + 8,
    y: pts[3][1] - 6,
    fill: "#fff",
    fontSize: "11",
    fontFamily: "DM Mono"
  }, "\u201350% by age 50")))));
}
window.Stats = Stats;
window.NadDecay = NadDecay;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/StatsNad.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/Ticker.jsx
try { (() => {
function PressTicker() {
  return /*#__PURE__*/React.createElement("div", {
    className: "mr-press"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mr-press-lbl"
  }, "As featured in"), /*#__PURE__*/React.createElement("span", {
    className: "mr-press-brand"
  }, "The Globe and Mail"), /*#__PURE__*/React.createElement("span", {
    className: "mr-press-brand"
  }, "Toronto Life"), /*#__PURE__*/React.createElement("span", {
    className: "mr-press-brand"
  }, "CBC"), /*#__PURE__*/React.createElement("span", {
    className: "mr-press-brand"
  }, "Wellness Magazine"), /*#__PURE__*/React.createElement("span", {
    className: "mr-press-brand"
  }, "Canadian Running"));
}
window.PressTicker = PressTicker;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/Ticker.jsx", error: String((e && e.message) || e) }); }

})();

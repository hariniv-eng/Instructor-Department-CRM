// GENERATED from lecture_sessions_master.csv (2026-10-27) -- the official LECTURE sessions of each course, built from the prod-sequence
// sheets and checked against the learning portal (_tmp_verify_unit_ids.ts). Used by "Taught in class" (taughtTraining.ts):
// total = lectures of the course; completed = lectures an instructor has held, matched by Unit ID (resource_id of the scheduled session).
// To change: edit the CSV and regenerate this file (do not hand-edit the IDs). Unit IDs are lower case without dashes.
// key: the Training Stats course key (portalKey) when the course is on that list, else an own key; subject: the "Taught in class" column group.
// LLM (2026-10-27, per request): the Python / Flask backend sessions are part of the GenAI track, taught before the LLM sessions, so they
// are the first 5 lectures of LLM (32 in all) instead of a course of their own.
export type LectureCourse = { key: string; portalKey: string | null; title: string; subject: string; lectures: { n: number; name: string; unitIds: string[] }[] };
// Static / Responsive Website (2026-10-27, per request): this year's "HTML & CSS" course teaches the same lectures with new unit IDs,
// added as extra IDs, so a lecture counts whichever version was taught (HTML & CSS list shared 2026-10-27).
// Extra unit IDs (2026-10-27, from _tmp_taught_audit.ts): the same lecture is taught under other course versions with their own unit
// IDs (e.g. "Modern Responsive Web Design", the campus "Quantitative Aptitude", "Advanced DBMS", "Generative AI", "Programming Foundations").
// Added only where the session's own unit has exactly the lecture's title AND the course is the same subject; cross-course matches
// (e.g. Python lectures inside C Programming, Set Operations inside Maths for CS) were left out.
// HTML & CSS (2026-10-27, per request): replaces the "Static Web" and "Responsive Design" columns. Its 20 lectures are the HTML & CSS
// prod sequence shared 2026-10-27 (the lectures before Modern Responsive; the rest of that sequence IS Modern Responsive UI, 21 lectures,
// so 41 in all). Each lecture also carries the unit ID of the same lecture in the old Static / Responsive Website courses, so earlier
// batches still count. Old-only lectures (Bootstrap, the project sections, CSS Transitions...) are no longer counted. Kept under the
// key / portalKey "static_web" so the column sits where Static Web was (before Modern Responsive UI); the title shown is "HTML & CSS".
export const LECTURE_COURSES: LectureCourse[] = [
 {
  "key": "python",
  "portalKey": "python",
  "title": "Python",
  "subject": "Backend",
  "lectures": [
   {
    "n": 1,
    "name": "Programming with Python",
    "unitIds": [
     "837f23cbd3be4f96877fb76f7defe3e2"
    ]
   },
   {
    "n": 2,
    "name": "Coding Practice Walkthrough | Part 1",
    "unitIds": [
     "f2a6cdec71354db49466d80aa26999fd"
    ]
   },
   {
    "n": 3,
    "name": "Leveraging Gen AI for Accelerated learning",
    "unitIds": [
     "e89439e95e5e4d4e8f63c55e4f81fd01"
    ]
   },
   {
    "n": 4,
    "name": "Variables and Data Types",
    "unitIds": [
     "60a0f78061334e849c6232a99d1ec7a0"
    ]
   },
   {
    "n": 5,
    "name": "Sequence of Instructions",
    "unitIds": [
     "90eaf23199924c589015c9d5312bb2eb",
     "ab40f67ee2e54819bae335570d8a67fe"
    ]
   },
   {
    "n": 6,
    "name": "Input and Output Basics",
    "unitIds": [
     "c3c4827058804187bd0c6716a94cb99d"
    ]
   },
   {
    "n": 7,
    "name": "Coding Practice Walkthrough | Part 2",
    "unitIds": [
     "16505de7d4814bf7b73079ce47e73503"
    ]
   },
   {
    "n": 8,
    "name": "How to debug your code?",
    "unitIds": [
     "644bef74d1504442ba7b0e03acfe3544"
    ]
   },
   {
    "n": 9,
    "name": "Type Conversions",
    "unitIds": [
     "dcc9159cfe50428b8cc1e3211b66d2ef"
    ]
   },
   {
    "n": 10,
    "name": "Relational Operators",
    "unitIds": [
     "4ed1f4cf692d404ab1c3ba0cd1863197"
    ]
   },
   {
    "n": 11,
    "name": "Logical Operators",
    "unitIds": [
     "6ecba024b99d499e8bdd6791519ea5ae",
     "8726cfe8e09842b5ab38909cda352832"
    ]
   },
   {
    "n": 12,
    "name": "Conditional Statements",
    "unitIds": [
     "549b2c081b9f4d52822c598ab9402494"
    ]
   },
   {
    "n": 13,
    "name": "Problem Solving and Debugging - Part 1",
    "unitIds": [
     "f56265459b7a4799930632ec25700f4c"
    ]
   },
   {
    "n": 14,
    "name": "Problem Solving and Debugging - Part 2",
    "unitIds": [
     "a93a699d6a17497297365566b1446ca2"
    ]
   },
   {
    "n": 15,
    "name": "Nested Conditional Statements",
    "unitIds": [
     "595fd9ac95a94e1b91cbae0d66006e30"
    ]
   },
   {
    "n": 16,
    "name": "Problem Solving | Part 1",
    "unitIds": [
     "75a05130717d45a988bfdf2209da6ae1"
    ]
   },
   {
    "n": 17,
    "name": "Loops",
    "unitIds": [
     "3b64b5f71d854a838688dc9d051d852f"
    ]
   },
   {
    "n": 18,
    "name": "Understanding Coding Question Formats",
    "unitIds": [
     "48f61d2d48ce4d61830fdf02062a43f4"
    ]
   },
   {
    "n": 19,
    "name": "For Loop",
    "unitIds": [
     "f6a42c4ecad04591b363afdd25e4b49f"
    ]
   },
   {
    "n": 20,
    "name": "Problem Solving | Part 2",
    "unitIds": [
     "c247deb17bf2453a90e74689e5e9c38c"
    ]
   },
   {
    "n": 21,
    "name": "Problem Solving | Part 3",
    "unitIds": [
     "9915d580265340b68569ed634aa24944"
    ]
   },
   {
    "n": 22,
    "name": "Problem Solving | Part 4",
    "unitIds": [
     "3994169dc5a845338eb6b861339f3637"
    ]
   },
   {
    "n": 23,
    "name": "String Methods",
    "unitIds": [
     "fb1aa19bd3994c519ac02290d0e8f80d"
    ]
   },
   {
    "n": 24,
    "name": "Problem Solving and Debugging - 3",
    "unitIds": [
     "40daac1814414960938f66c6b03cce67"
    ]
   },
   {
    "n": 25,
    "name": "Nested Loops",
    "unitIds": [
     "8d5ed6e69538402d86bc765b19d45f4c"
    ]
   },
   {
    "n": 26,
    "name": "Problem Solving - Part 5",
    "unitIds": [
     "c0111a1786974fcd8575530af3213752"
    ]
   },
   {
    "n": 27,
    "name": "Problem Solving - Part 6",
    "unitIds": [
     "83e061dd88db48c9b0886587488b907c"
    ]
   },
   {
    "n": 28,
    "name": "Problem Solving - Part 7",
    "unitIds": [
     "5cb3694fe5484121831ea666cc3825a5"
    ]
   },
   {
    "n": 29,
    "name": "Loop Control Statements",
    "unitIds": [
     "b64b1f096c9f436db8c20a9383cf6695",
     "01c62c5ca7694dc28ef6a0c1cc0bd68d"
    ]
   },
   {
    "n": 30,
    "name": "Comparing Strings & Naming Variables",
    "unitIds": [
     "3bd6dca956c14f84aa23a1d8a7396cf0"
    ]
   },
   {
    "n": 31,
    "name": "Problem Solving and Debugging - 4",
    "unitIds": [
     "f02bb72697d64d13bb5faa5b52baf3c4"
    ]
   },
   {
    "n": 32,
    "name": "Problem Solving and Debugging - 5",
    "unitIds": [
     "0b675d57650e4c04be0ff50a73e91f58"
    ]
   },
   {
    "n": 33,
    "name": "Lists",
    "unitIds": [
     "a489b3de43e44b6f825a44619f8c7df7",
     "63c2189dfc55405da866e34691253666"
    ]
   },
   {
    "n": 34,
    "name": "Working with Lists",
    "unitIds": [
     "e932ecb8f08c44cca5611f153b96786c"
    ]
   },
   {
    "n": 35,
    "name": "Lists and Strings",
    "unitIds": [
     "9c5518b5d5d24b52a2a67c403b68b084",
     "358b3232dc9a4a8faffc34269b7cfb96"
    ]
   },
   {
    "n": 36,
    "name": "Functions",
    "unitIds": [
     "f32c7dfb66854f54a744b41833093370"
    ]
   },
   {
    "n": 37,
    "name": "Function Arguments",
    "unitIds": [
     "3cdc557ab41247828bfb2dcf2466334b"
    ]
   },
   {
    "n": 38,
    "name": "Built-in Functions",
    "unitIds": [
     "8721e72acb6545d68487d657f921a230"
    ]
   },
   {
    "n": 39,
    "name": "Function Call Stack & Recursion",
    "unitIds": [
     "fa498f31e4d7407eb4377971ca833094"
    ]
   },
   {
    "n": 40,
    "name": "Understanding Recursion",
    "unitIds": [
     "26f9ce3c0c9f45ba82ccea6e1ae7b86f"
    ]
   },
   {
    "n": 41,
    "name": "Problem solving using Recursion - 1",
    "unitIds": [
     "964c48c78e864158b53498603fdc9838"
    ]
   },
   {
    "n": 42,
    "name": "Problem solving using Recursion - 2",
    "unitIds": [
     "0445bba7f3e04e1fb904bb177a1c9e80"
    ]
   },
   {
    "n": 43,
    "name": "List Methods",
    "unitIds": [
     "2318a1098e324c6ba7037cb2c57c8f18"
    ]
   },
   {
    "n": 44,
    "name": "Tuples & Sequences",
    "unitIds": [
     "b90fb5d1aef9419c8c35dccc8c2920ed",
     "5382b2d2ed154d209f0361582188ca46"
    ]
   },
   {
    "n": 45,
    "name": "Sets",
    "unitIds": [
     "0e50a0ea32fe409eab0d77c582e45f45"
    ]
   },
   {
    "n": 46,
    "name": "Set Operations",
    "unitIds": [
     "2877fa6d132d48728c7c93ad6ad3de38"
    ]
   },
   {
    "n": 47,
    "name": "Problem Solving and Debugging - Part 6",
    "unitIds": [
     "ef100c53d27a46d1930fd3510e296a08"
    ]
   },
   {
    "n": 48,
    "name": "Nested Lists & String Formatting",
    "unitIds": [
     "a7015141acd5413b8137fe80f1633299"
    ]
   },
   {
    "n": 49,
    "name": "Introduction to Matrices",
    "unitIds": [
     "092fba9c4a7346ba8114eb3366990c7a"
    ]
   },
   {
    "n": 50,
    "name": "Introduction to Shorthand expressions",
    "unitIds": [
     "6f56208247fe45e8b2c1e32496b0c706"
    ]
   },
   {
    "n": 51,
    "name": "Introduction to List comprehensions",
    "unitIds": [
     "fe8b5be258154745ab884ded92afcbbb",
     "cbe94e3f2c95412e9f82af8e94c9d5c8"
    ]
   },
   {
    "n": 52,
    "name": "Dictionaries",
    "unitIds": [
     "954c6f8d557f43eeab13dd634bedb1d5"
    ]
   },
   {
    "n": 53,
    "name": "Working with Dictionaries",
    "unitIds": [
     "ba84e1b213c74f53be9f911779168bb5"
    ]
   },
   {
    "n": 54,
    "name": "Problem Solving and Debugging - Part 7",
    "unitIds": [
     "d76d66c428ef423f8b90c7587472c901"
    ]
   },
   {
    "n": 55,
    "name": "Introduction to Object Oriented Programming",
    "unitIds": [
     "c206eea791e24f478ab537efae6a775d"
    ]
   },
   {
    "n": 56,
    "name": "Object Oriented Programming - Part 2",
    "unitIds": [
     "e4c13d55b0bb4fcaa14c25f84db68903"
    ]
   },
   {
    "n": 57,
    "name": "Classes & Objects",
    "unitIds": [
     "d635299bdc05441d866d0607d4cf7fe3"
    ]
   },
   {
    "n": 58,
    "name": "Attributes and Methods",
    "unitIds": [
     "d92d4334459a4e1cb3656561cae4586b"
    ]
   },
   {
    "n": 59,
    "name": "Encapsulation",
    "unitIds": [
     "ef73f0be79c24d08a19c7ac876e659dc"
    ]
   },
   {
    "n": 60,
    "name": "Inheritance",
    "unitIds": [
     "7a97030445574c4b9ce83f0f9871a273"
    ]
   },
   {
    "n": 61,
    "name": "Inheritance - Part 2",
    "unitIds": [
     "37de3141c70243db95aa67a82d62faf1"
    ]
   },
   {
    "n": 62,
    "name": "Abstraction",
    "unitIds": [
     "cec526e1614c4fda981f9d6d077a65e2"
    ]
   },
   {
    "n": 63,
    "name": "Polymorphism",
    "unitIds": [
     "34e227ff0a484090844f094ba3d6a0e1"
    ]
   },
   {
    "n": 64,
    "name": "OOP: On-Demand Session",
    "unitIds": [
     "f7a1a09f0f2146e2b93cfa2d1b50bd20"
    ]
   },
   {
    "n": 65,
    "name": "Python Standard Library",
    "unitIds": [
     "6ae1c51cfed440fbb52d4947ea1b8b60"
    ]
   },
   {
    "n": 66,
    "name": "Scope & Namespaces",
    "unitIds": [
     "073e838e23fc4447a716434b072f43d6"
    ]
   },
   {
    "n": 67,
    "name": "Errors & Exceptions",
    "unitIds": [
     "b638632d2e064f268dd724b7372c5b14"
    ]
   },
   {
    "n": 68,
    "name": "Working with Dates & Times",
    "unitIds": [
     "17332dc3780f4f5ab1bcabea5d100738"
    ]
   }
  ]
 },
 {
  "key": "static_web",
  "portalKey": "static_web",
  "title": "HTML & CSS",
  "subject": "Frontend",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to GenAI in Web Development",
    "unitIds": [
     "13893e7756274b22be3c9142c0ba14e9",
     "7bf8ee08c7944a8196fba2225d6157ae"
    ]
   },
   {
    "n": 2,
    "name": "Getting Started with Web Development",
    "unitIds": [
     "34890e58e10c4d1ea573d11bf08dbde4",
     "518fdb60e4f549729c32dc2d3c09b355"
    ]
   },
   {
    "n": 3,
    "name": "Introduction to HTML",
    "unitIds": [
     "a7c0731fd9904f179d33566b287d6bdc",
     "5d952538058943ea965dddb3aa314862"
    ]
   },
   {
    "n": 4,
    "name": "Leveraging GenAI for Accelerated Learning",
    "unitIds": [
     "dc1d2276f33845f7ac4383ad3c21b569",
     "beb8932cb4b94a6fa6b0c98777bafb90"
    ]
   },
   {
    "n": 5,
    "name": "Introduction to CSS | Part 1",
    "unitIds": [
     "33e9b5c19c074eddb3c97d73dab6ecc6",
     "75daf28c5bbc4f3bbf764b07a06c756b"
    ]
   },
   {
    "n": 6,
    "name": "Introduction to CSS | Part 2",
    "unitIds": [
     "4f237b09abda4cfa999fb8e7a2e32c69",
     "bea4e2e013d646edb456c9b554a742b1"
    ]
   },
   {
    "n": 7,
    "name": "Introduction to CSS | Part 3",
    "unitIds": [
     "a924ec958ac54c0d99c604dffbe1e144",
     "8bcfd5c9ff1d4b21857a4f7d6fe37c7d"
    ]
   },
   {
    "n": 8,
    "name": "Introduction to CSS Box Model | Part 1",
    "unitIds": [
     "98b48a948ed44514821233f2ec729686",
     "9c2f2322e97b40d09c6b4f1d714f6946"
    ]
   },
   {
    "n": 9,
    "name": "Introduction to CSS Box Model | Part 2",
    "unitIds": [
     "6d4ed7bd82094de1aab02eedde8a4f9a",
     "0043021407f441fc8ccc0905f14b330e"
    ]
   },
   {
    "n": 10,
    "name": "Coding Platform Walkthrough",
    "unitIds": [
     "6548dace7d3c4ce896f755f943209fb3"
    ]
   },
   {
    "n": 11,
    "name": "HTML Void Elements & Lists",
    "unitIds": [
     "7c8bceadde06433f8ac1533d77720bbb"
    ]
   },
   {
    "n": 12,
    "name": "Website: Behind the Scenes",
    "unitIds": [
     "0c25218f68464d35a518510f3ea70ac7",
     "b7d39617c71847c9be7878bd03df24a2"
    ]
   },
   {
    "n": 13,
    "name": "HTML Hyperlinks",
    "unitIds": [
     "3292103803e74e169e5ee6f9a22f401f",
     "f37f88e8983a483199a99c288878f4b0"
    ]
   },
   {
    "n": 14,
    "name": "Introduction to HTML5",
    "unitIds": [
     "9065d05557fb40df882951950964c8f3",
     "981300031b234f3c9dbd70e3ec1ae75b"
    ]
   },
   {
    "n": 15,
    "name": "HTML Semantic Elements",
    "unitIds": [
     "e452f0d779b94565a36dc8c2f4470c7d",
     "9627bbafa5094d88a2e7a28580a16ebb"
    ]
   },
   {
    "n": 16,
    "name": "Leveraging GenAI for Debugging & Building",
    "unitIds": [
     "5da6789023c440ec90b5cfcf5e3805a3",
     "e0a4515421414466b28384f3f60f344b"
    ]
   },
   {
    "n": 17,
    "name": "More CSS Concepts",
    "unitIds": [
     "c8b3711f893f47d0b5f342ce93944e73"
    ]
   },
   {
    "n": 18,
    "name": "CSS Selectors & Inheritance",
    "unitIds": [
     "3ffe2e51042b4ead8ca5fb71b9e4d3bb",
     "9ebf60e60b9d479bae8c6548d7c2b79a"
    ]
   },
   {
    "n": 19,
    "name": "More CSS Selectors",
    "unitIds": [
     "e464a0c4abe74d31b02cc97556c48682",
     "894f85432aea4c51a472c08123209181"
    ]
   },
   {
    "n": 20,
    "name": "CSS Specificity & Cascade",
    "unitIds": [
     "e5dd338102b74209aca4ce280b85f042",
     "f763f2788e3b4912a5bfd9b98319089e"
    ]
   }
  ]
 },
 {
  "key": "modern_responsive_ui",
  "portalKey": "modern_responsive_ui",
  "title": "Modern Responsive UI",
  "subject": "Frontend",
  "lectures": [
   {
    "n": 1,
    "name": "Sizing Elements and Handling Overflow",
    "unitIds": [
     "4490aacc70cc45e5a02042fc8b437dfa",
     "f5563899f8e14cd68037f9cc8ad40d7a"
    ]
   },
   {
    "n": 2,
    "name": "Box Sizing",
    "unitIds": [
     "8bb1775078c34653b65633dd85193be9",
     "1d30f10ad3254e379f45cf0b6bdc59a9"
    ]
   },
   {
    "n": 3,
    "name": "Introduction to CSS Flexbox",
    "unitIds": [
     "4ef3a89382fa4e06a2424346037a2c9e",
     "22a2807fee844fb9b7798ce5de8f0991"
    ]
   },
   {
    "n": 4,
    "name": "Introduction to CSS Flexbox | Part 2",
    "unitIds": [
     "22a59a92a1ae401f991114eb63e76f8d",
     "8057202cc00a45388eb6a80237c143c2"
    ]
   },
   {
    "n": 5,
    "name": "Introduction to CSS Flexbox | Part 3",
    "unitIds": [
     "9642cb7fad204d8fab13e7177a4da609",
     "8c48ac84362841e58530cd9abc6caef5"
    ]
   },
   {
    "n": 6,
    "name": "CSS Media Queries",
    "unitIds": [
     "665857e352ed48ffba187048eb2631c4",
     "2699160f3f1d4472a5ba410c43b5c779"
    ]
   },
   {
    "n": 7,
    "name": "Flexbox Sizing",
    "unitIds": [
     "f5671e6c0bb340da87bbb4c37fd5a66c",
     "3b16b1888ace4bb39da2f3630dbe8b40"
    ]
   },
   {
    "n": 8,
    "name": "Building Responsive Web Page | Part - 1",
    "unitIds": [
     "684b256644d742a192c733a8c724ae57"
    ]
   },
   {
    "n": 9,
    "name": "Building Responsive Web Page | Part - 2",
    "unitIds": [
     "0494f89682bb4e7195c33ca1b3a864d5"
    ]
   },
   {
    "n": 10,
    "name": "Building Responsive Web Page | Part - 3",
    "unitIds": [
     "a20f5368f0e34ab190b08c593e722a3d"
    ]
   },
   {
    "n": 11,
    "name": "Building a Website Using VS Code",
    "unitIds": [
     "5b9d3d5c3a3c419e947b07c3e8004d41"
    ]
   },
   {
    "n": 12,
    "name": "CSS Grid - 1 (+ CSS Grid - 1 | Properties)",
    "unitIds": [
     "d9c3b62b88fa41a78758027289315f46",
     "892611dfee91423192280e4dbcb165a2"
    ]
   },
   {
    "n": 13,
    "name": "CSS Grid - 2",
    "unitIds": [
     "5a5563651d91413aac4def58945a31f3"
    ]
   },
   {
    "n": 14,
    "name": "CSS Grid - 3",
    "unitIds": [
     "0e3e1d38c05346d0bad4fb9086dfda81"
    ]
   },
   {
    "n": 15,
    "name": "CSS Grid - 4 (+ Flexbox vs Grid)",
    "unitIds": [
     "b7ce76dc81b549cda329adcd844e36fe",
     "e8223d96de34436e81150a38ef08660e"
    ]
   },
   {
    "n": 16,
    "name": "CSS Positioning | Part 1",
    "unitIds": [
     "5c88d5e1f28844459af654f5470e3f5d",
     "72a4b194cae440628d95534ea00dce21"
    ]
   },
   {
    "n": 17,
    "name": "CSS Positioning | Part 2",
    "unitIds": [
     "61348839aa7a495e8d7793cd9adc2094",
     "2cb8c5db684a4ed2945cd236a829cb77"
    ]
   },
   {
    "n": 18,
    "name": "Introduction to Tailwind CSS",
    "unitIds": [
     "d4c4dbf0d742496c82771694ffa6cbbd",
     "2d9adc903ef244008ecc4aa4a85c3926"
    ]
   },
   {
    "n": 19,
    "name": "Introduction to Tailwind CSS | Part 2",
    "unitIds": [
     "01b56d48818147b589a5f150d6b68f7f",
     "d526c649383943f79a7d46be7eba80fd"
    ]
   },
   {
    "n": 20,
    "name": "Building Responsive Website using Tailwind CSS",
    "unitIds": [
     "90e157d1a56145038f71768ea60684c9"
    ]
   },
   {
    "n": 21,
    "name": "Building a Responsive Website using GenAI",
    "unitIds": [
     "f7db93dd3b494d47966dc5cbea4e9dda"
    ]
   }
  ]
 },
 {
  "key": "dynamic_web_app",
  "portalKey": "dynamic_web_app",
  "title": "Dynamic Web App",
  "subject": "Frontend",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to Dynamic Web Applications",
    "unitIds": [
     "6dc39559a9014fb2a7230a45875d28b9"
    ]
   },
   {
    "n": 2,
    "name": "DOM and Event Fundamentals",
    "unitIds": [
     "0533bf2cfd794718b3a1da9dddd1d8a5"
    ]
   },
   {
    "n": 3,
    "name": "Primitive Types & Conditionals",
    "unitIds": [
     "e1ff0afb77ea4c729e46aeaceffb5395"
    ]
   },
   {
    "n": 4,
    "name": "Input Element & Math Functions",
    "unitIds": [
     "391bcb9c044d441d9a474e13923790dd"
    ]
   },
   {
    "n": 5,
    "name": "Arrays & More DOM Manipulations",
    "unitIds": [
     "5adfaa3c56474c88b993ed1ea350cb9d"
    ]
   },
   {
    "n": 6,
    "name": "JS Coding Platform Walk-through",
    "unitIds": [
     "ef6381308a104c91accf54dd36ce6d18"
    ]
   },
   {
    "n": 7,
    "name": "Objects",
    "unitIds": [
     "0a1c94b0b29748b497b5c6655893d6d9"
    ]
   },
   {
    "n": 8,
    "name": "Callbacks & Schedulers",
    "unitIds": [
     "3f71dfa5df784281ac260cae2dc6c911"
    ]
   },
   {
    "n": 9,
    "name": "Event Listeners and More Events",
    "unitIds": [
     "7d2ea7918b7b4635914588f086dbc728"
    ]
   },
   {
    "n": 10,
    "name": "Hypertext Transfer Protocol (HTTP)",
    "unitIds": [
     "831d64e2c3894ce3898b49acd535085a"
    ]
   },
   {
    "n": 11,
    "name": "HTTP Requests using JS",
    "unitIds": [
     "0e28131566384d01a0e82d933027dbc8"
    ]
   },
   {
    "n": 12,
    "name": "Wikipedia Search Application",
    "unitIds": [
     "d7a9243c05c54d4685aa6f6fc0c76fb5"
    ]
   },
   {
    "n": 13,
    "name": "Forms",
    "unitIds": [
     "42af8d6fd0d948ebb35302cd623b88c0"
    ]
   },
   {
    "n": 14,
    "name": "Forms | Part 2",
    "unitIds": [
     "9d6dcc0348dc49e6b56d258d28ce0368"
    ]
   },
   {
    "n": 15,
    "name": "Building a Dynamic Website using Gen AI",
    "unitIds": [
     "955eb3b408394149b4d7a15b88d10eba"
    ]
   }
  ]
 },
 {
  "key": "math_for_cs",
  "portalKey": "math_for_cs",
  "title": "Mathematics for Computer Science",
  "subject": "Maths",
  "lectures": [
   {
    "n": 1,
    "name": "Course Overview",
    "unitIds": [
     "d858c9b2838e4e84943bd8c9c6252666",
     "2a2cd02025cb4409b2eadca2ce96e2fb"
    ]
   },
   {
    "n": 2,
    "name": "Number Systems: Decimal & Binary",
    "unitIds": [
     "052d86d73e4d422fa214b33d615f0a5e",
     "d952920c3840404abba32feeeac425a1"
    ]
   },
   {
    "n": 3,
    "name": "Number Systems: Octal & Hexadecimal",
    "unitIds": [
     "4df8747d22814e66a1acd8d6a146a5cc",
     "36a97e72683a4e39a3c95c5da78c9cdd"
    ]
   },
   {
    "n": 4,
    "name": "Basic Arithmetic Operations",
    "unitIds": [
     "28631164d86c4fcc94a42ee06a599d77",
     "9fa4f2145bb240bc8033bc71f3e411b7"
    ]
   },
   {
    "n": 5,
    "name": "Bitwise Operators",
    "unitIds": [
     "0da80d31a2d8432d9b46746e3b5c53c4",
     "d12f1e220190418c9e632002199b7689"
    ]
   },
   {
    "n": 6,
    "name": "Applications of Bitwise Operators",
    "unitIds": [
     "b9750096a94348ee9e742b282ea724a2"
    ]
   },
   {
    "n": 7,
    "name": "Representation of Signed & Unsigned Integers - I",
    "unitIds": [
     "99b4c8298f4541079857c07be3565122",
     "0f83c4a447d44eae8f8237da1602c4b4"
    ]
   },
   {
    "n": 8,
    "name": "Representation of Signed & Unsigned Integers - II",
    "unitIds": [
     "9274224887704edb82ac6dfc8218d8e9"
    ]
   },
   {
    "n": 9,
    "name": "GCD & LCM",
    "unitIds": [
     "484562fd53904dbfa97a6fb5264d54ca",
     "4007257f070f449182a4c8c8568dac03"
    ]
   },
   {
    "n": 10,
    "name": "Modulo Arithmetic - I",
    "unitIds": [
     "d18152e9eacf43f1a94ddc2f060bbe38",
     "48c07ca7ccaa4b2ea414484fd2259915"
    ]
   },
   {
    "n": 11,
    "name": "Modulo Arithmetic - II",
    "unitIds": [
     "83f012b87eb4441185b7adf9bbf8a7e0"
    ]
   },
   {
    "n": 12,
    "name": "Error Detection Techniques",
    "unitIds": [
     "78326dafe80343b2b5a64b42a2c15567",
     "6352ad66e26e4562bbc72e1a366376b2"
    ]
   },
   {
    "n": 13,
    "name": "Conditional Probability",
    "unitIds": [
     "498be89e63094135acb2611a2e0d8d7f",
     "89b720c9aa1b40d182c5ee58eb45c49d",
     "a052883d46a54adbb2fc2d82368225a1"
    ]
   },
   {
    "n": 14,
    "name": "Baye's Theorem & Expected Value",
    "unitIds": [
     "6c02771930104a22afd0c2c0c5d8a43c",
     "6fb02d6882784a9ca6c0ea6a14006a1d",
     "c5015c85f80e435fa253ecaadbb35514"
    ]
   },
   {
    "n": 15,
    "name": "Matrix Applications",
    "unitIds": [
     "54c53f1d05eb4191b944b7a914312c7a",
     "c617e846174c465093cc7b4977396c03"
    ]
   },
   {
    "n": 16,
    "name": "HP, Relation between AM, GM, & HM",
    "unitIds": [
     "859ff95ca98a4a04b303811fd0c4bc37"
    ]
   },
   {
    "n": 17,
    "name": "AGP Series",
    "unitIds": [
     "116b1da0c0c24b0eb97e52cb41199f1e",
     "41c79015b78c4c96b08b3cbc336211a0"
    ]
   },
   {
    "n": 18,
    "name": "Venn Diagrams and Applications",
    "unitIds": [
     "04d2a8aa3d0a41cab8f3c6ed1b10bad9",
     "b64d3fd84d314930b7453d1dbf20a70f"
    ]
   },
   {
    "n": 19,
    "name": "Cartesian Products",
    "unitIds": [
     "b17f618ff2bf49dfa3c14c3b55e7070f",
     "6470f1b6924e4623afa8f268833b693b"
    ]
   },
   {
    "n": 20,
    "name": "Functions and Properties",
    "unitIds": [
     "1e49fd4c54cb42d0a31cfd689e2f5105"
    ]
   },
   {
    "n": 21,
    "name": "Binary Operations",
    "unitIds": [
     "c2bb512308f54c2d94ba6a9817a120b0",
     "dea7d613a4004e388b4b08412cbe0d21"
    ]
   }
  ]
 },
 {
  "key": "quantitative_aptitude",
  "portalKey": "quantitative_aptitude",
  "title": "Quantitative Aptitude",
  "subject": "Aptitude",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction",
    "unitIds": [
     "d0d6e6c5075b4450978ed247a4c10944",
     "13ae361032c142e9b6b60e5d8e148b99"
    ]
   },
   {
    "n": 2,
    "name": "Numbers 1",
    "unitIds": [
     "879557a3518c4dd39da2effaac444fea"
    ]
   },
   {
    "n": 3,
    "name": "Power Cycles",
    "unitIds": [
     "126be18c23f94d76a92bf43b3f94dc5a",
     "089145f673f64126a97e2a60c6b028ae",
     "d078ae56c72749049ab935aba2993d10"
    ]
   },
   {
    "n": 4,
    "name": "Numbers- CSMCQ PPT",
    "unitIds": [
     "2f93f6bd09e745098c790bd82fe3a41e"
    ]
   },
   {
    "n": 5,
    "name": "Basics and Properties",
    "unitIds": [
     "d63657ed2221493fadf961434aeef192",
     "727bdc72746945a3800a54108d042e85",
     "ecc44aff703545acb03bf04c7981bda6"
    ]
   },
   {
    "n": 6,
    "name": "Multiples",
    "unitIds": [
     "12f37206d3fd40349463a3a4eb781c33",
     "35c2823cc28c4693abd74e9cbaea7973",
     "6c83d11edcad4457b18171ca03fe03b4"
    ]
   },
   {
    "n": 7,
    "name": "Factors",
    "unitIds": [
     "4c6785aa14864ae598527c9d518ed152",
     "29e3e96c0fcf491e9261aa801e26e344",
     "5e01a4e4dbcc4becb686584848334e3e"
    ]
   },
   {
    "n": 8,
    "name": "LCM & HCF - CSMCQ PPT",
    "unitIds": [
     "e02cf52520244e4bbcf88df2ad1ad2e5"
    ]
   },
   {
    "n": 9,
    "name": "Percentages Basics",
    "unitIds": [
     "77e79a21197e47d4859177d9c19386dc",
     "b8e17707f3614376a640ff6067a4e4d1",
     "ace74921685045b4824751d46777a824"
    ]
   },
   {
    "n": 10,
    "name": "Percentages 1",
    "unitIds": [
     "cd2069acc3074dbf80302d71dc1a1ba5",
     "6bdaf1ca3e644fc5906cd7f672395dc4",
     "1ab51232072a49a580fd044680d02963"
    ]
   },
   {
    "n": 11,
    "name": "Percentages 2",
    "unitIds": [
     "bda03ca5234b4096951b4cbe8b3a35b3",
     "ec97132cf3464b2e99cf78080c195933",
     "7718c3acb1c942cbbaffae51e69d1f6e"
    ]
   },
   {
    "n": 12,
    "name": "Profit & Loss",
    "unitIds": [
     "fc9e9e8b582347108cacf07592fc7d93",
     "1732837a714e421f9f845fc7816db21f",
     "9f976bbddfe24bd28c799445456b7712"
    ]
   },
   {
    "n": 13,
    "name": "Discount",
    "unitIds": [
     "364a66c5ecb743af80128a52422c1aba",
     "9b955b4d98ca434a922b20ad7b6a2f4e",
     "39bbf0160c8141c1832bcbe31be0786a"
    ]
   },
   {
    "n": 14,
    "name": "Company Specific Session - Percentages and profit & Loss",
    "unitIds": [
     "6b415c6a2c904f3b909d9eb71b001731",
     "a3e53bbb9ed5436b92e986db7c760049"
    ]
   },
   {
    "n": 15,
    "name": "Simple Interest",
    "unitIds": [
     "86f123c7c573467b8e96640b4653cb6e",
     "7a6185d77cd64232b311a6e1e4c28962"
    ]
   },
   {
    "n": 16,
    "name": "Compound Interest",
    "unitIds": [
     "b949a74e39574fcabf162164bbd3ac1d",
     "f1526ea48bb4490e8079d8404aedea25"
    ]
   },
   {
    "n": 17,
    "name": "Ratios",
    "unitIds": [
     "17e339622728478c953aa6f2f5910b2e",
     "6bd9e586a76c4cc78875acdc857ef923",
     "3ae3ed454f7747f4b9e3ad33b738ca4f"
    ]
   },
   {
    "n": 18,
    "name": "Proportions",
    "unitIds": [
     "0b0910a517c046a7bbbc295b99f15ce9",
     "502c2fe73efa4768bd3a7cc9e27aadb1",
     "26fd4a22b45e47cfb2a9e4d867297fdd"
    ]
   },
   {
    "n": 19,
    "name": "Company Specific Session - SI & CI and Ratios & Proportions",
    "unitIds": [
     "bded0ea2a8704b8db3ccda8951d8cd37",
     "122a978971dd47c59f68663e9b130f50"
    ]
   },
   {
    "n": 20,
    "name": "Mixtures and Alligations",
    "unitIds": [
     "fb5e8448f0b6424eab067c8b92c72b74",
     "e3d61e0ef8d34572842b1f1aaf32147e",
     "73545bfada0544d9937224786782013c"
    ]
   },
   {
    "n": 21,
    "name": "Partnerships",
    "unitIds": [
     "1ba163ed0be04a2ca04ebc7a4ee1f28c",
     "a5c435e8298b4e38ac9d59ce4f34fa77"
    ]
   },
   {
    "n": 22,
    "name": "Ages",
    "unitIds": [
     "21ee6f9ca6ee445191a92b5be6ddc703",
     "cfc4af4197bc435bae134bdb9de4d3e1",
     "9454861a63f242d8bda41cde34db2ba7"
    ]
   },
   {
    "n": 23,
    "name": "Averages",
    "unitIds": [
     "b605c97767fc4b76b4d366e8d0de45d4",
     "88d212d2804d4922a11c5f97a59fd6f6"
    ]
   },
   {
    "n": 24,
    "name": "Company Specific Session - Mixtures & Allegations, Partnerships, Ages, Averages",
    "unitIds": [
     "32496df9c6774cc3aa35a0fd03725df6"
    ]
   },
   {
    "n": 25,
    "name": "Basics & Average Speed",
    "unitIds": [
     "76174288ce5a4786979ba1b6da5779f0"
    ]
   },
   {
    "n": 26,
    "name": "Relative Speed",
    "unitIds": [
     "d01ac7c613f2494d9c18486a77b02ff9"
    ]
   },
   {
    "n": 27,
    "name": "Effective Speed",
    "unitIds": [
     "9eabbc60b4614d5397bd4714b209eea8"
    ]
   },
   {
    "n": 28,
    "name": "Problems on Trains",
    "unitIds": [
     "709e4e97e93547e98b08bfbd1a65ce44"
    ]
   },
   {
    "n": 29,
    "name": "Races",
    "unitIds": [
     "c75e0258730c4e268e827f5b2a9db2a3"
    ]
   },
   {
    "n": 30,
    "name": "Company Specific Session - Time, Speed and Distance",
    "unitIds": [
     "0cdd10be9163426d8cf4bc8c0e98e4ef"
    ]
   }
  ]
 },
 {
  "key": "lecture_introduction_to_english_language_and_communication",
  "portalKey": null,
  "title": "Introduction to English Language and Communication",
  "subject": "English",
  "lectures": [
   {
    "n": 1,
    "name": "Significance of Communication Skills; Mother Tongue vs English; Written English v/s Spoken English",
    "unitIds": [
     "04570147065645cfac05e7c025e5823b",
     "6fd7a6b3662e468e9593fe3eafe0f115",
     "04424c512d2c4dbf8a5d7c8bdb3b67f6"
    ]
   },
   {
    "n": 2,
    "name": "Knowledge v/s Skill; The Dynamics of English; Introduction to the Course",
    "unitIds": [
     "5533ffb487b94c388c1a8f7854ee7f28",
     "47db0ca3df1b48c99614c165a9b32d8c",
     "456ba435f12f4711bb376f3707d29bc9"
    ]
   }
  ]
 },
 {
  "key": "english_foundation",
  "portalKey": "english_foundation",
  "title": "Communicative English Foundation",
  "subject": "English",
  "lectures": [
   {
    "n": 1,
    "name": "About The Course; Noun Vs Main Verb (+ writing activity)",
    "unitIds": [
     "b4470ccf457a449e8cd177229a1b2e06",
     "0bf95e237cbb4e06b6c5b4f31e7a23cb",
     "eb2b6748f97f4021b6c2a61461d1f9fc"
    ]
   },
   {
    "n": 2,
    "name": "Noun: Number and Collection (+ writing activity)",
    "unitIds": [
     "eb76294c54cc4ec591533161c35cb318",
     "bf86b092846a4ef481a1a65da71ebcf1"
    ]
   },
   {
    "n": 3,
    "name": "Countable and Uncountable Nouns (+ writing activity)",
    "unitIds": [
     "556274d0617f41acb2fef15013a83c0d",
     "0d2cbd00ec4e45f8883998cd5af12801"
    ]
   },
   {
    "n": 4,
    "name": "Verb Forms; Nouns and Helping Verbs (+ 2 writing activities)",
    "unitIds": [
     "ece24c886ec24a0297f939c9cb9cd882",
     "b645ea73179d4a2fa3c72857c6704af7",
     "4d9614357cf4442f882ffb4e595d8bcc",
     "e3011abb3fc44aebb944412f0989b1c0"
    ]
   },
   {
    "n": 5,
    "name": "Possessive Noun: Apostrophe; Possessive Noun: 'Of' Form (+ 2 writing activities)",
    "unitIds": [
     "d917923024f24f9db5ebe91fd9471225",
     "9cc457a57bf9450e9f24c1a662c321f7",
     "2381bd7270c24ab0b685ea5854084184",
     "f6484e4bf4eb4e299ceacdae82bb0117"
    ]
   },
   {
    "n": 6,
    "name": "Pronouns: People and Things (+ writing activity)",
    "unitIds": [
     "b5e59cd910874aa48fbe0da778f5621d",
     "770e26cf21ff4afe9b0700fea8fca262"
    ]
   },
   {
    "n": 7,
    "name": "Possessive Pronouns (+ activity)",
    "unitIds": [
     "52b8d0057e9d45f9af02600602db5dfc",
     "0bf64f82aedf423fb54a30f07d71c651"
    ]
   },
   {
    "n": 8,
    "name": "Adjectives: Identification and Application; Adjectives: Degree (+ activity)",
    "unitIds": [
     "a016b9d9bb4348d4831bc9d2bb872580",
     "3639687d87a2449bae04c265c2a3fb45",
     "c7ed74f59c0e4ea8bcc606b813471163"
    ]
   },
   {
    "n": 9,
    "name": "Articles: A and An; Articles: The (+ 2 activities)",
    "unitIds": [
     "173c7446f74b458e9f31f5c7a6f3a2e9",
     "9cede33d95aa4c83bf1b1523f754eb1e",
     "577b22121d5340baa50e7b4bc2a0acec",
     "9574b871adec47ffac965f172ec4ba9e"
    ]
   },
   {
    "n": 10,
    "name": "Prepositions: Positions and Movement; Prepositions: Manner and Time (+ activity)",
    "unitIds": [
     "ea118be5510647528e35b61528415c39",
     "1a1e40f245eb43239da81ceabd255aed",
     "7b70cff75ed849ec80156faa83b6a7bf"
    ]
   },
   {
    "n": 11,
    "name": "Question Words (+ 3 activities)",
    "unitIds": [
     "74310800391e4877bee576f947db14a6",
     "283ae2497ae14f2a82ad1c1c2bf9e0fb",
     "9d071893bf8347208a0f1c2bc54d1429",
     "48edbf3f625b41e980f869eb3d4777ca"
    ]
   },
   {
    "n": 12,
    "name": "Adverbs (+ 2 activities)",
    "unitIds": [
     "e24ce6fb7e5849218458906c4200f92b",
     "6849f9ec5b274813bdff307893d702a6",
     "5192156beeb04e588d9d87403a41a2f1"
    ]
   },
   {
    "n": 13,
    "name": "Interjections; Contractions (+ 2 activities)",
    "unitIds": [
     "d904529d4bcc426590c1716fff06da19",
     "52b8ff4a1b5f41e1936ca1d952853fa2",
     "f10df6d5cffd4a458a5a64619893363f",
     "afcc15df61a34a9b8e9edf19f109f1d3"
    ]
   },
   {
    "n": 14,
    "name": "Conjunctions (+ writing activity)",
    "unitIds": [
     "fe5f0c76d0fd4e2dae19739e73842e51",
     "f861a24b07394e4b92da4d1ae9aff663"
    ]
   },
   {
    "n": 15,
    "name": "Tenses Possession; Vocabulary Warm-up 1 (+ writing activity)",
    "unitIds": [
     "68402a64f9f44ca69ab54868ad37febc",
     "780fb4db118c43668dfdaf7f894849b1",
     "6eb8790070354f8cba3c75be872751f8"
    ]
   },
   {
    "n": 16,
    "name": "Present Simple 1 (+ writing activity)",
    "unitIds": [
     "3e62c6699eb643459a3f2f91a3ac4aa1",
     "38b7afcd6f6a482cb82f01c8e8f58273"
    ]
   },
   {
    "n": 17,
    "name": "Present Simple 2 (+ activity)",
    "unitIds": [
     "18ce233be903483093d8b7ee80b35d1b",
     "a798d7551b95441ba030276d3e4b507d"
    ]
   },
   {
    "n": 18,
    "name": "Present Simple 3 (+ activity)",
    "unitIds": [
     "1b08f838cd34423e8ff26e5661240b1f",
     "671a3e19ea9f4428abbffe59a4f88078"
    ]
   },
   {
    "n": 19,
    "name": "Present Simple 4 (+ activity)",
    "unitIds": [
     "3fa5b23dfa3149058b35a63cd6dc4c2a",
     "f6da449e29ef44eb8620553fa9d4514a"
    ]
   },
   {
    "n": 20,
    "name": "Present Simple: Scenario Application (+ activity instructions)",
    "unitIds": [
     "a75c2aea02be4af8a4e3439045da565e",
     "df7873d9f618446f9c5ca2cb0f88cc54"
    ]
   },
   {
    "n": 21,
    "name": "Past Simple 1 (+ activity)",
    "unitIds": [
     "f495f2f68b514883bf3059e25fd1618f",
     "1547c46926114ca7b99598cca9cb0fd5"
    ]
   },
   {
    "n": 22,
    "name": "Past Simple 2 (+ activity)",
    "unitIds": [
     "a058b65a505947469cecc6a9eadf0756",
     "1bae571c68b34d9da99bc801eef4d4a2"
    ]
   },
   {
    "n": 23,
    "name": "Past Simple 3 (+ activity)",
    "unitIds": [
     "90867c4c01724b75b9f77584bfc737e3",
     "3131941d96b0478abf3ff669e6919b43"
    ]
   },
   {
    "n": 24,
    "name": "Past Simple 4 (+ writing activity)",
    "unitIds": [
     "c65d7669a91d49ad99dab87feab5543d",
     "adc91a30bfce4f42a37d0d6d5a724ea2"
    ]
   },
   {
    "n": 25,
    "name": "Past Simple: Scenario Application (+ activity instructions)",
    "unitIds": [
     "8ad1baf12ca84dea9617dc733d1ed3c0",
     "d7d4c6c6af46455cb3a22d2bb93545bf"
    ]
   }
  ]
 },
 {
  "key": "javascript_essentials",
  "portalKey": "javascript_essentials",
  "title": "JavaScript Essentials",
  "subject": "Frontend",
  "lectures": [
   {
    "n": 1,
    "name": "More Modern JS Concepts",
    "unitIds": [
     "cb345de6099b45e998aafbdba4215641"
    ]
   },
   {
    "n": 2,
    "name": "More Modern JS Concepts | Part 2",
    "unitIds": [
     "43ede48284234f31b6d2fa6a091141d3"
    ]
   },
   {
    "n": 3,
    "name": "Factory and Constructor Functions",
    "unitIds": [
     "b9e541f443d146cc8e37d9324509ba98"
    ]
   },
   {
    "n": 4,
    "name": "More Modern JS Concepts | Part 3",
    "unitIds": [
     "b74e401860a04802b2f90d00e0aa5a78"
    ]
   },
   {
    "n": 5,
    "name": "JS Classes",
    "unitIds": [
     "8c54362712ec4c6c9976517211fec497"
    ]
   },
   {
    "n": 6,
    "name": "JS Promises",
    "unitIds": [
     "a27b9508a2ed4529ab50e4f1a3b6b420"
    ]
   },
   {
    "n": 7,
    "name": "JS Promises | Part 2",
    "unitIds": [
     "740a166a09e44cd7a25a0e34acf2335a"
    ]
   },
   {
    "n": 8,
    "name": "More JS Concepts",
    "unitIds": [
     "ebd06382b35846d5b9b0d08c79b5d47d"
    ]
   },
   {
    "n": 9,
    "name": "JS Modules",
    "unitIds": [
     "2ef0cdefc201482199126b5ce90f7833"
    ]
   },
   {
    "n": 10,
    "name": "Node Packages",
    "unitIds": [
     "8521aab564d04b03b6900638647151d9"
    ]
   }
  ]
 },
 {
  "key": "react_js",
  "portalKey": "react_js",
  "title": "React JS",
  "subject": "Frontend",
  "lectures": [
   {
    "n": 1,
    "name": "Your React Journey",
    "unitIds": [
     "1520097b5d914bd2bca198411b3edfe3"
    ]
   },
   {
    "n": 2,
    "name": "Introduction to React JS",
    "unitIds": [
     "97a460050ddf41fd84664923ee377e71"
    ]
   },
   {
    "n": 3,
    "name": "Introduction to React JS | Part 2",
    "unitIds": [
     "04ae155b83fe4a849b20d5ec24136498"
    ]
   },
   {
    "n": 4,
    "name": "Components and Props",
    "unitIds": [
     "d9b1ba606cd24921a513a40cbd9cd9f6"
    ]
   },
   {
    "n": 5,
    "name": "Components and Props | Part 2",
    "unitIds": [
     "28cb2847d6a94f549533a1fc88dafdad"
    ]
   },
   {
    "n": 6,
    "name": "Lists & Keys",
    "unitIds": [
     "237c4a706eca4c8fb9e5327c9eef3357"
    ]
   },
   {
    "n": 7,
    "name": "State & Events",
    "unitIds": [
     "6aa9707100284c1dacb25edeee1e9a30"
    ]
   },
   {
    "n": 8,
    "name": "Conditional Rendering",
    "unitIds": [
     "aa378f8c96c84eb29507e1135928d3c8"
    ]
   },
   {
    "n": 9,
    "name": "State Hook | Part 2",
    "unitIds": [
     "2a08091ce0b1405488be5e1aaee100de"
    ]
   },
   {
    "n": 10,
    "name": "State Hook | Part 2 | Delete Functionality",
    "unitIds": [
     "bbad3c0146824592bddb45b759c0647a"
    ]
   },
   {
    "n": 11,
    "name": "State Hook | Part 3",
    "unitIds": [
     "5519d18c3209482d997c184c3de3dd1a"
    ]
   },
   {
    "n": 12,
    "name": "Effect Hook and Rules of Hooks",
    "unitIds": [
     "3410ebfcd5fa4575bc2bc85356ef3138"
    ]
   },
   {
    "n": 13,
    "name": "Effect Hooks - 2",
    "unitIds": [
     "643790827f6843799a1ed90adfcef463"
    ]
   },
   {
    "n": 14,
    "name": "Effect Hooks - 2 | Optimizing Performance",
    "unitIds": [
     "e49a2f74c2cd40ec9e4a49f5cdc4b735"
    ]
   },
   {
    "n": 15,
    "name": "Making API Call with Hooks",
    "unitIds": [
     "84a4289ac49b4cabbb67ff82711f47ea"
    ]
   },
   {
    "n": 16,
    "name": "Making API Call with Hooks | Part 2",
    "unitIds": [
     "f5b19b4d45794267a9d1121d2fa4dcaf"
    ]
   },
   {
    "n": 17,
    "name": "Schedulers with Hooks",
    "unitIds": [
     "cdd5d57f33df469aa89e17954608033b"
    ]
   },
   {
    "n": 18,
    "name": "Schedulers with Hooks | Part 2",
    "unitIds": [
     "57497f1e302f453cadc796391cc70e6b"
    ]
   },
   {
    "n": 19,
    "name": "React Under the Hood",
    "unitIds": [
     "365ca5e623c64506a265007ec644115c"
    ]
   },
   {
    "n": 20,
    "name": "Routing using React Router",
    "unitIds": [
     "42d0a7c0c1ee478e8019a6df70878e6a"
    ]
   },
   {
    "n": 21,
    "name": "Routing using React Router | Routing Components",
    "unitIds": [
     "e6a415b1e62d4d60af751d5de6c21ff1"
    ]
   },
   {
    "n": 22,
    "name": "Routing using React Router | Part 2",
    "unitIds": [
     "de4f1736ba9f448589dbbe608d0cca8e"
    ]
   },
   {
    "n": 23,
    "name": "Authentication & Authorization",
    "unitIds": [
     "06fa65069cf14a908c1c88b078bf858b"
    ]
   },
   {
    "n": 24,
    "name": "Authentication & Authorization | Route Parameters",
    "unitIds": [
     "2d830dde6c0c4d41b1622b0d87fe88cf"
    ]
   },
   {
    "n": 25,
    "name": "Authentication & Authorization | Part 2",
    "unitIds": [
     "bf193cf037124df383fed3f73fc711ab"
    ]
   },
   {
    "n": 26,
    "name": "Authentication & Authorization | Part 2 | Handling Redirections",
    "unitIds": [
     "45d86bc99af444e2b6c516f7afb88af5"
    ]
   },
   {
    "n": 27,
    "name": "Authentication & Authorization | Part 3",
    "unitIds": [
     "6d51b6acca5c43b99e271b2cd5bdfca8"
    ]
   },
   {
    "n": 28,
    "name": "Authentication & Authorization | Part 4",
    "unitIds": [
     "22fd797e42064c3693569999ba4aeb5f"
    ]
   },
   {
    "n": 29,
    "name": "Authentication & Authorization | Part 4 | Handling Views",
    "unitIds": [
     "929fcb3de2da4d2488aac38ff6c2a229"
    ]
   },
   {
    "n": 30,
    "name": "Sorting Products",
    "unitIds": [
     "7000bb78e4ef4a11931d9d557eb5b33b"
    ]
   },
   {
    "n": 31,
    "name": "React Context",
    "unitIds": [
     "38f44e3042e5441e80fa096b3af5a57f"
    ]
   },
   {
    "n": 32,
    "name": "React Context | Part 2",
    "unitIds": [
     "13b05c44d3624633aa820104018c8183"
    ]
   },
   {
    "n": 33,
    "name": "React Context | Part 3",
    "unitIds": [
     "a64aafefabb84c36a302456f32ad7214"
    ]
   }
  ]
 },
 {
  "key": "english_advanced",
  "portalKey": "english_advanced",
  "title": "Communicative English Advanced",
  "subject": "English",
  "lectures": [
   {
    "n": 1,
    "name": "About The Course",
    "unitIds": [
     "c10c03140bf94b05b3ef18b24af0decd"
    ]
   },
   {
    "n": 2,
    "name": "Future Simple 1",
    "unitIds": [
     "75a5352587934409b901b3c4b8bd832b"
    ]
   },
   {
    "n": 3,
    "name": "Future Simple 2",
    "unitIds": [
     "42980c4bbaac4ef2be590e09f435aa98"
    ]
   },
   {
    "n": 4,
    "name": "Future Simple: Scenario Application",
    "unitIds": [
     "01466852e2454539a9c252da14c5e328"
    ]
   },
   {
    "n": 5,
    "name": "Tenses Ability",
    "unitIds": [
     "be380a6b4b984fda97ddb83bb88252e6"
    ]
   },
   {
    "n": 6,
    "name": "Tenses Continuous",
    "unitIds": [
     "d3d781935a8d4afd916f5cef5722fa48"
    ]
   },
   {
    "n": 7,
    "name": "Scenario Application: Simple and Continuous Tenses",
    "unitIds": [
     "2a946aff703a4b348c0a5468ca18a4dd"
    ]
   },
   {
    "n": 8,
    "name": "Modal Verbs",
    "unitIds": [
     "e68be439d4954d87969b014970335bd5"
    ]
   },
   {
    "n": 9,
    "name": "Present Perfect",
    "unitIds": [
     "6c0cbfe871b84f8aa7a956f0a75f3c57"
    ]
   },
   {
    "n": 10,
    "name": "Present Perfect Continuous Tense",
    "unitIds": [
     "22bf888151c048449e1af299350ed037"
    ]
   },
   {
    "n": 11,
    "name": "Present Perfect and Perfect Continuous Application",
    "unitIds": [
     "6ddfbaa60fd448cf94430503877f9e83"
    ]
   },
   {
    "n": 12,
    "name": "Past Perfect",
    "unitIds": [
     "dc7e9649ae0d47bdb92f05631fef8d8c"
    ]
   },
   {
    "n": 13,
    "name": "Past Perfect Continuous",
    "unitIds": [
     "5d1e111f03a645819917f7e6e7834ee9"
    ]
   },
   {
    "n": 14,
    "name": "Past Perfect and Past Perfect Continuous Application",
    "unitIds": [
     "ada675abfc7e4660a0348974e375ea16"
    ]
   },
   {
    "n": 15,
    "name": "Future Perfect",
    "unitIds": [
     "601c2a0572c04ed382e729fbe2173288"
    ]
   },
   {
    "n": 16,
    "name": "Future Perfect Continuous",
    "unitIds": [
     "e64d7e0c61e043ffb46909a9d47f727e"
    ]
   },
   {
    "n": 17,
    "name": "Question Making with Question Words",
    "unitIds": [
     "46d1e5d74a28495698ac08a39f49cf9d"
    ]
   },
   {
    "n": 18,
    "name": "Question Making with Question Verbs",
    "unitIds": [
     "c4c1aefbf7004928b7e395d1f1d9ae69"
    ]
   },
   {
    "n": 19,
    "name": "Punctuation",
    "unitIds": [
     "110f03de2db64f66a0a6b29f4a355d0f"
    ]
   },
   {
    "n": 20,
    "name": "Articulation",
    "unitIds": [
     "ca09c7c50af8446ca9e26838a60f017b"
    ]
   }
  ]
 },
 {
  "key": "lecture_dsa_c",
  "portalKey": null,
  "title": "DSA (C++)",
  "subject": "DSA",
  "lectures": [
   {
    "n": 1,
    "name": "C++ Basics Part - 1",
    "unitIds": [
     "8a0b4ddcc44941fca4c5845cea7697a1"
    ]
   },
   {
    "n": 2,
    "name": "C++ Basics Part - 2",
    "unitIds": [
     "42453ec87e0e401c934ec50ee376819c"
    ]
   },
   {
    "n": 3,
    "name": "C++ STL Part - 1",
    "unitIds": [
     "0950402bdd4b4771a19042d539ec33f2"
    ]
   },
   {
    "n": 4,
    "name": "C++ STL Part - 2",
    "unitIds": [
     "8c3cd8b7191041ebac82b0d2588a0e84"
    ]
   },
   {
    "n": 5,
    "name": "C++ STL Part - 3",
    "unitIds": [
     "0a4e44fda3b1465fb833e09e8daa1dd7"
    ]
   },
   {
    "n": 6,
    "name": "Introduction To DSA",
    "unitIds": [
     "62a9801408dc46f0a704899446e30f93"
    ]
   },
   {
    "n": 7,
    "name": "Time Complexity",
    "unitIds": [
     "113c4e4e569049d0ba0cd4415638ec14"
    ]
   },
   {
    "n": 8,
    "name": "Space Complexity",
    "unitIds": [
     "94baf9d07f164b8fa17f88e8f5300a1c"
    ]
   },
   {
    "n": 9,
    "name": "Pseudo Code",
    "unitIds": [
     "8ff2e9e7428641578ba1f403ee199884"
    ]
   },
   {
    "n": 10,
    "name": "Math Basics Part 1",
    "unitIds": [
     "bc8d10c5ce0f4a979fbc970313916ee1"
    ]
   },
   {
    "n": 11,
    "name": "Math Basics Part 2",
    "unitIds": [
     "620552cab021403da8db947244b3b69a"
    ]
   },
   {
    "n": 12,
    "name": "Largest Element",
    "unitIds": [
     "29f9530bd55b4b06b4be687c91d0bbb5"
    ]
   },
   {
    "n": 13,
    "name": "Second Largest Element",
    "unitIds": [
     "a854fca1eab84b0bbd3cd741b5991d16"
    ]
   },
   {
    "n": 14,
    "name": "Maximum Consecutive Ones and Finding Missing Number",
    "unitIds": [
     "33a986174048463ea1fb613ce137b5b0"
    ]
   },
   {
    "n": 15,
    "name": "Checking if Array is Sorted and Removing Duplicates",
    "unitIds": [
     "646697ebb80c41ed84bf50d9abb41287"
    ]
   },
   {
    "n": 16,
    "name": "Moving Zeros to the End",
    "unitIds": [
     "6959388e7ff14d86a80c9741b266ec6a"
    ]
   },
   {
    "n": 17,
    "name": "Strings - Built-in Methods",
    "unitIds": [
     "7051e7cafb0a43738bf3cdfd98c7043f"
    ]
   },
   {
    "n": 18,
    "name": "Valid Anagram",
    "unitIds": [
     "8541c15af4db4cf8b88ff8eaf55c028a"
    ]
   },
   {
    "n": 19,
    "name": "Isomorphic Strings",
    "unitIds": [
     "7d3e99715c694dc49a6bf1a83d464e6f"
    ]
   },
   {
    "n": 20,
    "name": "Reverse Words in a String",
    "unitIds": [
     "fa55be7c08af4ee1b6f9899098b2a2ff"
    ]
   },
   {
    "n": 21,
    "name": "Understanding Recursion",
    "unitIds": [
     "0984ca638a024febb913ca43ba047b08"
    ]
   },
   {
    "n": 22,
    "name": "Printing 1 to N and N to 1 Using Recursion",
    "unitIds": [
     "131cfc456052490b80bf316df789097f"
    ]
   },
   {
    "n": 23,
    "name": "Sum of N & Factorial Using Recursion",
    "unitIds": [
     "18f0afabf19d4897953a702cda49f220"
    ]
   },
   {
    "n": 24,
    "name": "Reversing an Array and Checking Palindromes Using Recursion",
    "unitIds": [
     "9cd8efa4a93848858926611ced7676b2"
    ]
   },
   {
    "n": 25,
    "name": "Fibonacci Series Using Recursion",
    "unitIds": [
     "e3ca686c056a45dbad0bc5863ab2bbb1"
    ]
   },
   {
    "n": 26,
    "name": "Backtracking: Unique Subsets",
    "unitIds": [
     "1894e7b38bed4a7796115bb395c62dc8"
    ]
   },
   {
    "n": 27,
    "name": "Backtracking: Purchase Combinations",
    "unitIds": [
     "235abfb982774b93955aff8bff74a98a"
    ]
   },
   {
    "n": 28,
    "name": "All subsequences",
    "unitIds": [
     "4c23083baaa143979a589ff452f18558"
    ]
   },
   {
    "n": 29,
    "name": "Selection Sort",
    "unitIds": [
     "a27ac4d28f6e4ca6abe28a470faa5cf3"
    ]
   },
   {
    "n": 30,
    "name": "Bubble Sort",
    "unitIds": [
     "1c45869347354595bd199bed9577685e"
    ]
   },
   {
    "n": 31,
    "name": "Insertion Sort",
    "unitIds": [
     "7f6deacd73064aadb34b48448dbd487c"
    ]
   },
   {
    "n": 32,
    "name": "Merge Sort Part 1",
    "unitIds": [
     "470d0bac139f487081c190484e73f153"
    ]
   },
   {
    "n": 33,
    "name": "Merge Sort Part 2",
    "unitIds": [
     "acd62aa68a414f3ba00431fffadcdc73"
    ]
   },
   {
    "n": 34,
    "name": "Quick Sort",
    "unitIds": [
     "831bd07079974a389ed9fff0436694b6"
    ]
   },
   {
    "n": 35,
    "name": "Introduction to Binary Search",
    "unitIds": [
     "e27b8e35e4f24ad08c8a6d5fb9805298"
    ]
   },
   {
    "n": 36,
    "name": "Lower and Upper Bounds",
    "unitIds": [
     "6e18c0d401d44b58bfbae56bd87d6cfc"
    ]
   },
   {
    "n": 37,
    "name": "Binary Operations",
    "unitIds": [
     "6db9fa5a84ca49728841801616ce0f7c"
    ]
   },
   {
    "n": 38,
    "name": "Code for Binary Conversion",
    "unitIds": [
     "1d210194385b41b9bc75e93ad2971a18"
    ]
   },
   {
    "n": 39,
    "name": "Bitwise Operators",
    "unitIds": [
     "44698907d655443780c96d98490b43ce"
    ]
   },
   {
    "n": 40,
    "name": "Bit Manipulation Techniques 1",
    "unitIds": [
     "23b13df1c4f24ad78c73c19b2be4dd98"
    ]
   },
   {
    "n": 41,
    "name": "Bit Manipulation Techniques 2",
    "unitIds": [
     "ada74c9813ed465592af19364469d5e9"
    ]
   }
  ]
 },
 {
  "key": "numerical_ability",
  "portalKey": "numerical_ability",
  "title": "Numerical Ability",
  "subject": "Aptitude",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction",
    "unitIds": [
     "44c295288967455c8186659fea24a924"
    ]
   },
   {
    "n": 2,
    "name": "Time and Work",
    "unitIds": [
     "90da8dbe3e4f4d3a98783d9a105f8437"
    ]
   },
   {
    "n": 3,
    "name": "Pipes and Cisterns",
    "unitIds": [
     "77f508c9fe1347ac983e99306861d0c7"
    ]
   },
   {
    "n": 4,
    "name": "Man-chain Rule and Wages",
    "unitIds": [
     "a795ad439f044001a2b0f5f610076cf6"
    ]
   },
   {
    "n": 5,
    "name": "Company Specific Session - Time and Work",
    "unitIds": [
     "2650713877264d918592bd3e36a05e4b"
    ]
   },
   {
    "n": 6,
    "name": "Basics",
    "unitIds": [
     "014af4d3f913449cba4901bc197e0d22"
    ]
   },
   {
    "n": 7,
    "name": "Permutations",
    "unitIds": [
     "64bb0d75bf674f6aa2b8670736f2d0cc"
    ]
   },
   {
    "n": 8,
    "name": "Combinations",
    "unitIds": [
     "a390705d0e4b4ff49d35af0338365e4d"
    ]
   },
   {
    "n": 9,
    "name": "Coins and Dice",
    "unitIds": [
     "9c267be3906f488a895bad35ec94b871"
    ]
   },
   {
    "n": 10,
    "name": "Cards and Miscellaneous",
    "unitIds": [
     "132c16606a404c6789b75e06417516df"
    ]
   },
   {
    "n": 11,
    "name": "Company Specific Session - Permutations, Combinations & Probability",
    "unitIds": [
     "ca99c90a21454fb2a74492a9539bfa27"
    ]
   },
   {
    "n": 12,
    "name": "Clocks 1",
    "unitIds": [
     "c9c99bd99e194095a7f00cc0495a9221"
    ]
   },
   {
    "n": 13,
    "name": "Clocks 2",
    "unitIds": [
     "825c260625ef4bf8ba647386006afa8d"
    ]
   },
   {
    "n": 14,
    "name": "Clocks 3",
    "unitIds": [
     "d25edc4a8a2a49ae85edb362b0d0d974"
    ]
   },
   {
    "n": 15,
    "name": "Calendars 1",
    "unitIds": [
     "112fc93b2fa1404b840421060b600549"
    ]
   },
   {
    "n": 16,
    "name": "Calendars 2",
    "unitIds": [
     "1849f46aeea74a7abb05a2550173aeb4"
    ]
   },
   {
    "n": 17,
    "name": "Company Specific Session - Clocks & Calendars",
    "unitIds": [
     "d7101f6326a34d54b996a31e85f1979d"
    ]
   },
   {
    "n": 18,
    "name": "DI Tables",
    "unitIds": [
     "e8d28bd511ed43b29036d9dce5b6b641",
     "ebdc65487a784d84af53cded9a9f4710"
    ]
   },
   {
    "n": 19,
    "name": "DI Graphs",
    "unitIds": [
     "768ca3b73ff8456e8fe7d6f961d7eb78",
     "008f141a0e3e4240a77bbb82f365796b"
    ]
   },
   {
    "n": 20,
    "name": "DI Pie Charts",
    "unitIds": [
     "15cd00c2cc9447f6ae97c3f8ee436ca3"
    ]
   },
   {
    "n": 21,
    "name": "Company Specific Session - DI",
    "unitIds": [
     "a7a61f9f369c4a7bb82dba8684af2021"
    ]
   },
   {
    "n": 22,
    "name": "Ranking",
    "unitIds": [
     "fcf940b067e040a08ab9595b5f3c3fed",
     "70d105b5fbeb425cab40ece70d1e4686"
    ]
   },
   {
    "n": 23,
    "name": "Directions",
    "unitIds": [
     "74021209bd17421397d2bb7eee96ef49",
     "559d411644b448959fe15669f89bf902"
    ]
   },
   {
    "n": 24,
    "name": "Company Specific Session - Ranking & Directions",
    "unitIds": [
     "a7e663f62f5b4844b02bc55e79339da0"
    ]
   },
   {
    "n": 25,
    "name": "Number Series",
    "unitIds": [
     "f40068e7a3c94c97ab339b181e86b598",
     "693f71c7453244a1937253a746d4306c"
    ]
   },
   {
    "n": 26,
    "name": "Alphabet Series",
    "unitIds": [
     "ad7058cd8bf542ba8fe42126997ddf27",
     "081e3499bb5847f2821c8d2b8ddefef0"
    ]
   },
   {
    "n": 27,
    "name": "Odd Man Out & Analogies",
    "unitIds": [
     "610a08908c17467b95121b741841ddbc"
    ]
   },
   {
    "n": 28,
    "name": "Coded Language",
    "unitIds": [
     "dec1510c1baf4e25ba12ae834da4b00f"
    ]
   },
   {
    "n": 29,
    "name": "Company Specific Session - Coding & Decoding",
    "unitIds": [
     "0bd20f3a989347a7995c00c3b53d3922"
    ]
   }
  ]
 },
 {
  "key": "llm",
  "portalKey": "llm",
  "title": "LLM",
  "subject": "GenAI",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to Google Colab",
    "unitIds": [
     "3280f0e6db4c4123a3a5b4670ffc7260"
    ]
   },
   {
    "n": 2,
    "name": "Introduction to Third-Party Packages",
    "unitIds": [
     "a4e4c0d4258a4331aac7a2668dc41e33"
    ]
   },
   {
    "n": 3,
    "name": "Introduction to Flask",
    "unitIds": [
     "6406bff08c6546feb812db97162a8fac"
    ]
   },
   {
    "n": 4,
    "name": "Building Rest APIs using Flask",
    "unitIds": [
     "f8610c6b6149400da4582a81073019aa"
    ]
   },
   {
    "n": 5,
    "name": "Integrating Flask APIs in Frontend",
    "unitIds": [
     "5b8712b2965449219eabd205b5816095"
    ]
   },
   {
    "n": 6,
    "name": "Your Learning Journey",
    "unitIds": [
     "43e0c07336e244569b814d6baea1d566"
    ]
   },
   {
    "n": 7,
    "name": "Building LLM Applications Using Python | Part 1",
    "unitIds": [
     "3331e6f99f854bf39925fef421b64a77"
    ]
   },
   {
    "n": 8,
    "name": "Building LLM Applications Using Python | Part 2",
    "unitIds": [
     "eb61fdf45b9345b4aeaf217cc7ab88b0"
    ]
   },
   {
    "n": 9,
    "name": "Building UI for LLM Applications",
    "unitIds": [
     "37f2438472174ff9aa65efa7afefb5cf"
    ]
   },
   {
    "n": 10,
    "name": "Deploying LLM Applications",
    "unitIds": [
     "f6d7d9a2e4314bca853969f69e69910e"
    ]
   },
   {
    "n": 11,
    "name": "Understanding How LLMs Work | Part 1",
    "unitIds": [
     "16cd8836fe334162be41b8913ae3a69f"
    ]
   },
   {
    "n": 12,
    "name": "Understanding How LLMs Work | Part 2",
    "unitIds": [
     "24f646b95d4849b6ba3a1c96cc2e863e"
    ]
   },
   {
    "n": 13,
    "name": "Enhancing Productivity with AI",
    "unitIds": [
     "ac5136695c3442f0a6d015dda5f235da"
    ]
   },
   {
    "n": 14,
    "name": "Tool use & Function Calling in LLMs",
    "unitIds": [
     "5a6be15f6b1c4c3e85132d15f9e7607a"
    ]
   },
   {
    "n": 15,
    "name": "Effective Prompting Techniques",
    "unitIds": [
     "f45177263ef24dea83cdd329a7edcf80"
    ]
   },
   {
    "n": 16,
    "name": "Introduction to Langchain",
    "unitIds": [
     "e9ef9e04ea0a44d49572d3270460d9ef"
    ]
   },
   {
    "n": 17,
    "name": "Introduction to Retrieval-Augmented Generation | Part 1",
    "unitIds": [
     "3561231f590e4857ba272aea9d984921"
    ]
   },
   {
    "n": 18,
    "name": "Introduction to Retrieval-Augmented Generation | Part 2",
    "unitIds": [
     "4a92e788211a43918e510a620df242aa"
    ]
   },
   {
    "n": 19,
    "name": "Building AI Agents using Langchain",
    "unitIds": [
     "32278073b9b44d7cb8634161c95a417e"
    ]
   },
   {
    "n": 20,
    "name": "Building Memory Agents",
    "unitIds": [
     "3ea03301ebe14b94b04b2689940cb25d"
    ]
   },
   {
    "n": 21,
    "name": "AI in the Real World",
    "unitIds": [
     "7a0865e203eb4f1b815a4c52711429d3"
    ]
   },
   {
    "n": 22,
    "name": "Building an AI-Powered Conversational Interview Assistant | Part 1",
    "unitIds": [
     "0b47342bc36f4287aa1ffcd1ecd5ad10"
    ]
   },
   {
    "n": 23,
    "name": "Building an AI-Powered Conversational Interview Assistant | Part 2",
    "unitIds": [
     "34b94fe7130a47f19624fb526661becf"
    ]
   },
   {
    "n": 24,
    "name": "Building RAG Agents Using LangChain",
    "unitIds": [
     "652e24a78661463a9cd4aab446c46af8"
    ]
   },
   {
    "n": 25,
    "name": "Introduction to Context Engineering",
    "unitIds": [
     "e65b64e88086467db69418eb3aa31e57"
    ]
   },
   {
    "n": 26,
    "name": "Integrating MCP",
    "unitIds": [
     "80dc2fef7a5243c0abd3a8be632bca18"
    ]
   },
   {
    "n": 27,
    "name": "Building Multi Agent Systems Using Crew AI",
    "unitIds": [
     "05254f43f7384a15999ca07f8d18fe9d"
    ]
   },
   {
    "n": 28,
    "name": "Building a Game Development Crew",
    "unitIds": [
     "5433e634492e4acaadc618fd8ff91b95"
    ]
   },
   {
    "n": 29,
    "name": "Introduction to LLM Evaluation | Part 1",
    "unitIds": [
     "214d4c55a84d4b4d8c4553f58e0ab504"
    ]
   },
   {
    "n": 30,
    "name": "Introduction to LLM Evaluation | Part 2",
    "unitIds": [
     "a527b20d30684c6488294ff4e2db6858"
    ]
   },
   {
    "n": 31,
    "name": "Running Models Locally",
    "unitIds": [
     "7786a136c51a475fa3573e98e2f96616"
    ]
   },
   {
    "n": 32,
    "name": "Fine-Tuning LLMs",
    "unitIds": [
     "48d32faa0ec842eca36d423819bd1f7c"
    ]
   }
  ]
 },
 {
  "key": "sql",
  "portalKey": "sql",
  "title": "SQL",
  "subject": "Backend",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to Databases | Part - 1",
    "unitIds": [
     "07ceabfc4e424299baaa234c132ca3a9"
    ]
   },
   {
    "n": 2,
    "name": "Introduction to Databases | Part - 2",
    "unitIds": [
     "13fa3d91dc494e48b9788191f5228864"
    ]
   },
   {
    "n": 3,
    "name": "Introduction To SQL | Part - 1",
    "unitIds": [
     "3a7b2d473c5a4a6381c6468a360e3e01"
    ]
   },
   {
    "n": 4,
    "name": "Introduction To SQL | Part - 2",
    "unitIds": [
     "f6dca6ec4de84d26af5dee88693ef1ff"
    ]
   },
   {
    "n": 5,
    "name": "Platform Walkthrough",
    "unitIds": [
     "298d3ea7eb774b60a6152ce0484d1412"
    ]
   },
   {
    "n": 6,
    "name": "Querying with SQL | Part - 1",
    "unitIds": [
     "ef690d6abe764033babf730d5c95fd7b"
    ]
   },
   {
    "n": 7,
    "name": "Querying with SQL | Part - 2",
    "unitIds": [
     "a2098e5c6bf047ab89c264a00c3e001d"
    ]
   },
   {
    "n": 8,
    "name": "Querying with SQL | Part - 3",
    "unitIds": [
     "7fd9de0cbbfb459fab1b86cb81f6fb5f"
    ]
   },
   {
    "n": 9,
    "name": "Querying with SQL | Part 4",
    "unitIds": [
     "70a657a770794be5a352a2763789d53b"
    ]
   },
   {
    "n": 10,
    "name": "Aggregations",
    "unitIds": [
     "300987bc04944afab1ba373e37647c62"
    ]
   },
   {
    "n": 11,
    "name": "Group By",
    "unitIds": [
     "edb98c46de604ffda7181b12812d48df"
    ]
   },
   {
    "n": 12,
    "name": "Group By with Having",
    "unitIds": [
     "e9dfaa054e514b099fe854bf6d532602"
    ]
   },
   {
    "n": 13,
    "name": "SQL Expressions and Functions",
    "unitIds": [
     "c4449948ea794d7e947ffbf4cc4a8137"
    ]
   },
   {
    "n": 14,
    "name": "SQL Case Clause and Set Operations",
    "unitIds": [
     "4cad287f9250425eb14fc65b9f48f5aa"
    ]
   },
   {
    "n": 15,
    "name": "Modelling Database | Part - 1",
    "unitIds": [
     "567a8e0199784172b7a85519ebfbd57f"
    ]
   },
   {
    "n": 16,
    "name": "Modeling Databases | Part 1 | Relationship",
    "unitIds": [
     "e293edc1e1854a0ca85c32521a7be1dc"
    ]
   },
   {
    "n": 17,
    "name": "Modelling Database | Part - 2",
    "unitIds": [
     "0a2ae0561ce6478c960f371c753b57a1",
     "176473757aee4e6398502d264f95266c"
    ]
   },
   {
    "n": 18,
    "name": "Modelling Database | Part - 2 | Querying On Multiple Tables",
    "unitIds": [
     "48deab43591e4ef0aabf0398bbcb720f"
    ]
   },
   {
    "n": 19,
    "name": "Joins | Part - 1",
    "unitIds": [
     "45e7e6a316bf47b8bc1bf6a5eb2467e9"
    ]
   },
   {
    "n": 20,
    "name": "Querying with Joins | Part - 2",
    "unitIds": [
     "a3796e061e9849738a89b013f44616ce"
    ]
   },
   {
    "n": 21,
    "name": "Joins | Part - 3",
    "unitIds": [
     "050dc768702b43d29b05dfd54a333fce"
    ]
   },
   {
    "n": 22,
    "name": "Views",
    "unitIds": [
     "eaab6effc7b24c8bb3c4f7d4c39fd379"
    ]
   },
   {
    "n": 23,
    "name": "Subqueries",
    "unitIds": [
     "fdba8007d15c42c9b4c676b8fdabfffb"
    ]
   },
   {
    "n": 24,
    "name": "Transaction and Indexes",
    "unitIds": [
     "841b85692038419785564271e832de1e"
    ]
   }
  ]
 },
 {
  "key": "lecture_dbms",
  "portalKey": null,
  "title": "DBMS",
  "subject": "Backend",
  "lectures": [
   {
    "n": 1,
    "name": "Keys in DBMS",
    "unitIds": [
     "70daba1ca8e24af592465299be9b236e"
    ]
   },
   {
    "n": 2,
    "name": "Schema Refinement and Database Anomalies",
    "unitIds": [
     "b0b04c90ced64170afce2209dba59470",
     "a483b052e9a842b0bee66fb567fbd904"
    ]
   },
   {
    "n": 3,
    "name": "Normalization and Functional Dependency",
    "unitIds": [
     "fdc3cef0a6f8435aaecd60dbf7f72d16",
     "6119ff18d8354fe387f020a7f86524c6"
    ]
   },
   {
    "n": 4,
    "name": "Normal Forms",
    "unitIds": [
     "e9a670e8f3f7415cbef8eb7f7715e8bd",
     "24353b4bd1314fea9bb4181aa62332f8"
    ]
   },
   {
    "n": 5,
    "name": "Denormalization",
    "unitIds": [
     "7160e8c2c89842518ca602306aed21a3"
    ]
   },
   {
    "n": 6,
    "name": "Transaction and Concurrency Control",
    "unitIds": [
     "3f19d8280b8141239db92e8f7bd30458"
    ]
   }
  ]
 },
 {
  "key": "mongodb",
  "portalKey": "mongodb",
  "title": "MongoDB",
  "subject": "Backend",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to MongoDB",
    "unitIds": [
     "44ca047c30344ed5b4cff01f47e9e269",
     "49496004c6034a3f87594cc032dd01e2"
    ]
   },
   {
    "n": 2,
    "name": "Getting Started with MongoDB",
    "unitIds": [
     "85c3087d6e3d4f8ab7d6c5e40a377bb3",
     "da21a59a592c481eb0d4134da3aa1c6c"
    ]
   },
   {
    "n": 3,
    "name": "Querying MongoDB - Part 1",
    "unitIds": [
     "e398793e2e7f4cd4beffa9727aa4fd8a",
     "dede734ad64b47fc9dcd02d012b4bedc"
    ]
   },
   {
    "n": 4,
    "name": "Querying MongoDB - Part 1 | Projection",
    "unitIds": [
     "299cc79bcb2d4349abd82d24816d9b03"
    ]
   },
   {
    "n": 5,
    "name": "Querying MongoDB - Part 2",
    "unitIds": [
     "e747902e4e2241a49866ef8d380fbad7",
     "a15d697536e54c19abb82947b7a8b063"
    ]
   },
   {
    "n": 6,
    "name": "Querying MongoDB - Part 2 | Pagination",
    "unitIds": [
     "f3aa5232fab84266b48a6ab7bcdf34a3"
    ]
   },
   {
    "n": 7,
    "name": "Grouping & Aggregations",
    "unitIds": [
     "5743f904500e40a0a3db4e5bc379af93",
     "58dc15dab9ee4336bcf53519c6757c42"
    ]
   },
   {
    "n": 8,
    "name": "Grouping & Aggregations | Part 2",
    "unitIds": [
     "983ea66f3f22434d8d94ec476f4be3dd"
    ]
   },
   {
    "n": 9,
    "name": "Complex Field Types - Part 1",
    "unitIds": [
     "9f0a505f3ca9417387e69c5a9bfb04b0",
     "a61a5856b14e4eb293b9545ec0d218bf"
    ]
   },
   {
    "n": 10,
    "name": "Complex Field Types - Part 2",
    "unitIds": [
     "7f3803f9f23b47f7bb6bde483c123e42",
     "1e46aa64a9dc463db9f6751670ac646f"
    ]
   }
  ]
 },
 {
  "key": "probability_statistics",
  "portalKey": "probability_statistics",
  "title": "Probability and Statistics",
  "subject": "Maths",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to Probability & Statistics in ML",
    "unitIds": [
     "4bae337edf6d4a6e9d63875563343238"
    ]
   },
   {
    "n": 2,
    "name": "Introduction to Statistics & Datasets",
    "unitIds": [
     "419072ad5a674cceb15cc6ad788ed10a"
    ]
   },
   {
    "n": 3,
    "name": "Data Visualization - I",
    "unitIds": [
     "afbbebe6324c4c39b4e574b6102269af"
    ]
   },
   {
    "n": 4,
    "name": "Data Visualization - II",
    "unitIds": [
     "ee98a978e59247b099a5dee02195a052"
    ]
   },
   {
    "n": 5,
    "name": "Data Visualization Implementation",
    "unitIds": [
     "c7bc7729d4a84692b398a57d71ff0e1d"
    ]
   },
   {
    "n": 6,
    "name": "Measures of Central Tendency",
    "unitIds": [
     "85a5e120ef2145ca9907be323dfc4ac9",
     "99e7f7232b9d43c8943d9b9feae10bdd"
    ]
   },
   {
    "n": 7,
    "name": "Measures of Central Tendency Implementation",
    "unitIds": [
     "0a03c279b3e74b81900aebe73b99d9ea"
    ]
   },
   {
    "n": 8,
    "name": "Measures of Variability",
    "unitIds": [
     "1bf391f325144adf93972ba7c02277df",
     "41edae5c7c964b9b916db6375b875414"
    ]
   },
   {
    "n": 9,
    "name": "Skewness and Outliers",
    "unitIds": [
     "975ecf7af669489ab619cabe1af14fae"
    ]
   },
   {
    "n": 10,
    "name": "Measures of Variability Implementation",
    "unitIds": [
     "de6d97fe1d8a406e866a35511b04e15f"
    ]
   },
   {
    "n": 11,
    "name": "Basics of Probability",
    "unitIds": [
     "2e520ed5e7ce4418858458c6f61be5f2",
     "a0c675ce34084e34aae49550e331baa1"
    ]
   },
   {
    "n": 12,
    "name": "Probability Rules & Theorems",
    "unitIds": [
     "a9c334ddd2ae4e9aaecd995dcd8b239b"
    ]
   },
   {
    "n": 13,
    "name": "Conditional Probability",
    "unitIds": [
     "a94464fbbfd045d39af894cb170ff6f7",
     "9027bbdb39194f958bfc564cf0510304"
    ]
   },
   {
    "n": 14,
    "name": "Law of Partition and Total Probability",
    "unitIds": [
     "62bcd4c933a04a5d8cb447cba3d30ce2"
    ]
   },
   {
    "n": 15,
    "name": "Skewness & Outliers Implementation",
    "unitIds": [
     "3548081433d04b72a17c2681ca9d6d1d"
    ]
   },
   {
    "n": 16,
    "name": "Baye's Theorem and counting principles",
    "unitIds": [
     "0e93171af2424f74a58734dceae3638a"
    ]
   },
   {
    "n": 17,
    "name": "Discrete Random Variables",
    "unitIds": [
     "93281bc2f83e4bc2840d6364c625afa0"
    ]
   },
   {
    "n": 18,
    "name": "Continuous Random Variables",
    "unitIds": [
     "dcbb9b5524904becb7b2cd5397d25833"
    ]
   },
   {
    "n": 19,
    "name": "Binomial Distribution",
    "unitIds": [
     "1b033b0cbcc44ff1aa65c96d3bfc7e7c",
     "9392b42c76ca442c98232dc8fe471195"
    ]
   },
   {
    "n": 20,
    "name": "Fundamentals of Probability Implementation",
    "unitIds": [
     "a0c30afbae3a41e9a3cdca6dee254cf5"
    ]
   },
   {
    "n": 21,
    "name": "Poisson Distribution",
    "unitIds": [
     "0eb045569cca43d28cd58b58fa5709fe",
     "41da3364668741c2b2626342c35de49a"
    ]
   },
   {
    "n": 22,
    "name": "Normal Distribution - I",
    "unitIds": [
     "ddf6abff781546aabf200b071bc65c6b"
    ]
   },
   {
    "n": 23,
    "name": "Normal Distribution - II",
    "unitIds": [
     "16dcf874eebe4f0aa3b3905d47deab83"
    ]
   },
   {
    "n": 24,
    "name": "Other Continuous Probability Distributions",
    "unitIds": [
     "b03833b8fc0945ec89b6fde7c3f13e1f"
    ]
   },
   {
    "n": 25,
    "name": "Probability Distributions Implementation",
    "unitIds": [
     "102b1a11349c4b6a8f4a67a1822f653a"
    ]
   },
   {
    "n": 26,
    "name": "Introduction to Inferential Statistics",
    "unitIds": [
     "98c7bfe549d64cf2889c2c2a80600335"
    ]
   },
   {
    "n": 27,
    "name": "Introduction to Sampling",
    "unitIds": [
     "d4e3ae473b4044888537a1f27b01c4c5",
     "203668ddcb4b495a9eb34a1730981716"
    ]
   },
   {
    "n": 28,
    "name": "Sampling Distribution",
    "unitIds": [
     "d47eb0e9f2e6458eaca3afd19e857359",
     "e4500fc4ea8243e28b3f85e618f22f7d"
    ]
   },
   {
    "n": 29,
    "name": "Sampling Distribution - Central limit theorem Implementation",
    "unitIds": [
     "1d5aaacf8eb24b9bbc489d589aeb6e0a"
    ]
   },
   {
    "n": 30,
    "name": "Confidence Intervals & Confidence Levels",
    "unitIds": [
     "a9e7dc2d5a314bd8a6b69c8e84a8e23b"
    ]
   },
   {
    "n": 31,
    "name": "Testing of Hypothesis - Mean",
    "unitIds": [
     "51d8671e64e24a3094b67e2f0d82b6a3"
    ]
   },
   {
    "n": 32,
    "name": "Testing of Hypothesis - Difference of Means",
    "unitIds": [
     "f4dcc0ad87cc48199b6d8a6593a5b124"
    ]
   },
   {
    "n": 33,
    "name": "z - test Implementation",
    "unitIds": [
     "b26bbcccfab6496583bc7db80ef2f4e6"
    ]
   },
   {
    "n": 34,
    "name": "Chi - Squared Test",
    "unitIds": [
     "83c9cbad35064e1fab6a8eaff56520a8"
    ]
   },
   {
    "n": 35,
    "name": "T - test Implementation",
    "unitIds": [
     "b1901e793a0d408d9257589595edaec2"
    ]
   },
   {
    "n": 36,
    "name": "Anova & F - Test - one way",
    "unitIds": [
     "6cc90e7f23f14502a65d314cfdcaabae"
    ]
   },
   {
    "n": 37,
    "name": "Anova & F - Test - two way",
    "unitIds": [
     "74f244ecc411414ea24b8c5be861185a"
    ]
   },
   {
    "n": 38,
    "name": "Covarience and Correlation",
    "unitIds": [
     "ff63f9aca25649e9b0a8cbcb1559e7ab"
    ]
   },
   {
    "n": 39,
    "name": "Linear Regression",
    "unitIds": [
     "a22a60f0662f40658c5774dc9a6b6cf4"
    ]
   },
   {
    "n": 40,
    "name": "Chi - Squared Test Implementation",
    "unitIds": [
     "ffc60461317648b8b15b86b717c221e4"
    ]
   },
   {
    "n": 41,
    "name": "Multiple Linear Regression",
    "unitIds": [
     "80411b8308724e9683c469366d981298",
     "2a2885b9785f45eb94ebdbd615330766"
    ]
   },
   {
    "n": 42,
    "name": "Non - Linear Regression",
    "unitIds": [
     "6edd2373f7844acfa46eecf74e5d2e80",
     "d49de8ff4e214a618b8b581ea084074d"
    ]
   },
   {
    "n": 43,
    "name": "Anova & F - Test Implementation",
    "unitIds": [
     "759dbae57f4145449176aae9bf33a4a5"
    ]
   },
   {
    "n": 44,
    "name": "Covariance and Correlation Implementation",
    "unitIds": [
     "46f389949c3b46fc86aa41b54bf83197"
    ]
   }
  ]
 },
 {
  "key": "node_js",
  "portalKey": "node_js",
  "title": "Node JS",
  "subject": "Backend",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction to Backend Development (+ Cloud IDE Walkthrough)",
    "unitIds": [
     "f96ff5f5ce1346a4a49762adba933a57",
     "6a3d1968448a4d16a4fffdfad1780390"
    ]
   },
   {
    "n": 2,
    "name": "Introduction to Express JS (+ Solving A Node JS Question In Cloud IDE)",
    "unitIds": [
     "86d20fcd81044b74b06d0bcd2c4b552e",
     "ad39846d16804606bb87f7f6f6770e8d"
    ]
   },
   {
    "n": 3,
    "name": "Introduction to Express JS | Part 2",
    "unitIds": [
     "69811f2c6c614ae9a333a340d3202a8c"
    ]
   },
   {
    "n": 4,
    "name": "Introduction to Express JS | Part 3",
    "unitIds": [
     "e54a915d32c949df9fa4cc5f82b94e5d"
    ]
   },
   {
    "n": 5,
    "name": "REST APIs",
    "unitIds": [
     "ab3a0f02ecc445d8b776f6166addd99d"
    ]
   },
   {
    "n": 6,
    "name": "Debugging Common Errors",
    "unitIds": [
     "0df25f59b1da495fbb92a76daea558d3"
    ]
   },
   {
    "n": 7,
    "name": "Debugging Common Errors | Part 2",
    "unitIds": [
     "78d13ed8ce4945958955d0b220ddc4dd"
    ]
   },
   {
    "n": 8,
    "name": "Authentication",
    "unitIds": [
     "f8ac7ad5ac7a412a863bcfbe4bf01273"
    ]
   },
   {
    "n": 9,
    "name": "Authentication | Part 2",
    "unitIds": [
     "d880ff0602ba4ddcb733b7f05de63617"
    ]
   },
   {
    "n": 10,
    "name": "Authentication | Part 3",
    "unitIds": [
     "4b59520ec00b4cca89b90ec77bec105f"
    ]
   },
   {
    "n": 11,
    "name": "File Systems Part - 1",
    "unitIds": [
     "8ab1210bc93f44bf8ccb9a57af44a4f8"
    ]
   },
   {
    "n": 12,
    "name": "File Systems Part - 2",
    "unitIds": [
     "64f07907e26e43deb8a8cb9e8a0dde42"
    ]
   },
   {
    "n": 13,
    "name": "Streams",
    "unitIds": [
     "7db674ec650a43fe896f5657f93518db"
    ]
   },
   {
    "n": 14,
    "name": "Connecting MongoDB to NodeJS",
    "unitIds": [
     "086ee1bfa473481393671fa634f70609"
    ]
   },
   {
    "n": 15,
    "name": "Introduction to MVC and Mongoose Models",
    "unitIds": [
     "549070828a7a4a36b3bf0582466b732a"
    ]
   },
   {
    "n": 16,
    "name": "Implementing CRUD Operations | Part 1",
    "unitIds": [
     "12f6b539f2a44297891c94a49d2d4501"
    ]
   },
   {
    "n": 17,
    "name": "Implementing CRUD Operations | Part 2",
    "unitIds": [
     "18ca8a4352aa49408c0dd0cb824655a6"
    ]
   },
   {
    "n": 18,
    "name": "Filtering and Sorting",
    "unitIds": [
     "ef0b6d09fe1b4d858fa9df1f416b23ae"
    ]
   },
   {
    "n": 19,
    "name": "Protected Routes with JWT Authentication",
    "unitIds": [
     "08f4f820d35c49d28fc4dae765bd54b3"
    ]
   },
   {
    "n": 20,
    "name": "Role-Based Authorization",
    "unitIds": [
     "57a53301d62a4bfd9f3ca10d067f79d7"
    ]
   }
  ]
 },
 {
  "key": "logical_reasoning",
  "portalKey": "logical_reasoning",
  "title": "Logical Reasoning",
  "subject": "Aptitude",
  "lectures": [
   {
    "n": 1,
    "name": "Introduction",
    "unitIds": [
     "11702c788d2f42d298baff5ce60b1ee6"
    ]
   },
   {
    "n": 2,
    "name": "Linear Arrangements",
    "unitIds": [
     "18e0bff7be6b4808a7aa0e39c4e36d50"
    ]
   },
   {
    "n": 3,
    "name": "Circular Arrangements",
    "unitIds": [
     "96c7b7350ace470c9101332f5c6ae8c3"
    ]
   },
   {
    "n": 4,
    "name": "Blood Relations 1",
    "unitIds": [
     "518a02b2c5b6498d99be925ab4fbb683"
    ]
   },
   {
    "n": 5,
    "name": "Blood Relations 2",
    "unitIds": [
     "76613305b77648718829d012e1620200"
    ]
   },
   {
    "n": 6,
    "name": "Company Specific Session - Arrangements & Blood relations",
    "unitIds": [
     "16beb9ea81de41ce8e7e02941fec3051"
    ]
   },
   {
    "n": 7,
    "name": "Venn Diagrams",
    "unitIds": [
     "c524720da40f407f8de12f20112111c2",
     "e3470675bacb43478a001a9f16e1f9d8"
    ]
   },
   {
    "n": 8,
    "name": "Syllogisms 1",
    "unitIds": [
     "8ea5b9ce397a4aafa9d4a0fe0da7992c",
     "86157980f4a44dd19e284c5f3a8c0b86"
    ]
   },
   {
    "n": 9,
    "name": "Syllogisms 2",
    "unitIds": [
     "8da023e3d1a84745864aa668346eef19",
     "ef85275bd58640528c96250206f37716"
    ]
   },
   {
    "n": 10,
    "name": "Cubes",
    "unitIds": [
     "31f405622a7a4f2b92cf94e2e6351449",
     "c6d68d9b77ae44548708e24a1168cce6"
    ]
   },
   {
    "n": 11,
    "name": "Company Specific Session - Venn Diagrams, Syllogisms, Cubes",
    "unitIds": [
     "5db32318168e48519c7dbf799930e623"
    ]
   },
   {
    "n": 12,
    "name": "Puzzles",
    "unitIds": [
     "8eb2f44b0b1349f1916559b717866775"
    ]
   },
   {
    "n": 13,
    "name": "Data Sufficiency",
    "unitIds": [
     "e58078fd622b4b6ea9275ade68fc03d0"
    ]
   },
   {
    "n": 14,
    "name": "Company Specific Session - Puzzles & Data Sufficiency",
    "unitIds": [
     "333ce9acfcfc4b34874d2c44a2ae9c4a"
    ]
   },
   {
    "n": 15,
    "name": "Counting Figures",
    "unitIds": [
     "a9b8a3c409ff4537b76ffb7fb2a7bbdd"
    ]
   },
   {
    "n": 16,
    "name": "Visual Reasoning",
    "unitIds": [
     "50fb32f59547485784a601ac5a20d5f5"
    ]
   }
  ]
 },
 {
  "key": "english_applied",
  "portalKey": "english_applied",
  "title": "Communicative English Applied",
  "subject": "English",
  "lectures": [
   {
    "n": 1,
    "name": "Accuracy in Sentence Structure",
    "unitIds": [
     "d99f29b3cd2b48f0a8904295b61c22cb"
    ]
   },
   {
    "n": 2,
    "name": "The Language of Connection (2 slots)",
    "unitIds": [
     "5b98ba15e9c3483e9eacdafd31cb5dfc",
     "7916d8c05a22465a93d4e020cd0dc1bb"
    ]
   },
   {
    "n": 3,
    "name": "Mastering the Art of Discussion",
    "unitIds": [
     "2333f825b8df49c8b1a11c34ffd8a129"
    ]
   },
   {
    "n": 4,
    "name": "Designing Clear Prompts",
    "unitIds": [
     "5b435121ae7840089a11a551ff4f173e",
     "a0962cbf81b148fe820fb78696eb2c6c"
    ]
   },
   {
    "n": 5,
    "name": "Framing Effective Questions",
    "unitIds": [
     "d4ef5369a2e0417d83f9bc6cf6c9f3e8"
    ]
   },
   {
    "n": 6,
    "name": "Emphasizing Self-Expression",
    "unitIds": [
     "fa58517ca91d4a6e97aecc2d38bdb593"
    ]
   },
   {
    "n": 7,
    "name": "Expressing Possibility and Obligation",
    "unitIds": [
     "46a48b65c27049adbf46d98aa68d0bc4",
     "aacb92ab1d6e4529817c0e51378abfbd"
    ]
   },
   {
    "n": 8,
    "name": "Rephrasing Speech Accurately",
    "unitIds": [
     "59f3bcb1fd4f4c6f94c19af0eb4d7325"
    ]
   },
   {
    "n": 9,
    "name": "Shifting Focus in Communication",
    "unitIds": [
     "f90dc4153eab43a6a155218709279f1e"
    ]
   },
   {
    "n": 10,
    "name": "Improving Natural Fluency",
    "unitIds": [
     "aadb5854354740b8b8e4394355e2ff47"
    ]
   },
   {
    "n": 11,
    "name": "Balancing Ideas Clearly (Enhancing Communicative Style)",
    "unitIds": [
     "92bffb55d46648c9b85071965a0af66f",
     "838db06169a74fa9888ced0e3de0d986"
    ]
   },
   {
    "n": 12,
    "name": "Managing Hesitation and Emphasizing Key Points",
    "unitIds": [
     "3cc30236a82547d6a60101938bb657ff",
     "8be5d43bb15c420582d4f7b5441dff29"
    ]
   }
  ]
 },
 {
  "key": "lecture_dsa_ii_hashing_linked_lists_stacks_trees_heaps",
  "portalKey": null,
  "title": "DSA II (Hashing, Linked Lists, Stacks, Trees, Heaps)",
  "subject": "DSA",
  "lectures": [
   {
    "n": 1,
    "name": "Hashing",
    "unitIds": [
     "30982e6a375b45a497b10e3b447a7d2a"
    ]
   },
   {
    "n": 2,
    "name": "Prefix Sum",
    "unitIds": [
     "a7b2fb3ae3aa4723a2418f47574197f9"
    ]
   },
   {
    "n": 3,
    "name": "Sliding Window, Two-Pointer Technique",
    "unitIds": [
     "bc9f4ac19b6043b99da3b864a8ae993a"
    ]
   },
   {
    "n": 4,
    "name": "Longest Subarray with Sum K",
    "unitIds": [
     "07246cf4f1694951818b5f1cd75fb027"
    ]
   },
   {
    "n": 5,
    "name": "Largest Subarray Sum",
    "unitIds": [
     "e47750454cd644d3ae930a283c0d806d"
    ]
   },
   {
    "n": 6,
    "name": "Two Sum",
    "unitIds": [
     "c4f3ed1211aa4e028f2a45a07f2a6231"
    ]
   },
   {
    "n": 7,
    "name": "Introduction to Linked List",
    "unitIds": [
     "c1eeeb9720564790ab30ddeedbd2fe7f"
    ]
   },
   {
    "n": 8,
    "name": "Insertion in Linked List",
    "unitIds": [
     "87f9912a5ea74cba9f227eb1c61cbdec"
    ]
   },
   {
    "n": 9,
    "name": "Deletion in Linked List",
    "unitIds": [
     "7aa796a04bca4b24938a3d2d7b63f5cb"
    ]
   },
   {
    "n": 10,
    "name": "Introduction to Doubly Linked List",
    "unitIds": [
     "253000b62e614f93878737bea8bdc1fe"
    ]
   },
   {
    "n": 11,
    "name": "Insertion in Doubly Linked List",
    "unitIds": [
     "581a1a424bbf4c3ca35c0d5566cdb9a5"
    ]
   },
   {
    "n": 12,
    "name": "Deletion in Doubly Linked List",
    "unitIds": [
     "78d45cea90ec4a278a883a95aa91eec7"
    ]
   },
   {
    "n": 13,
    "name": "Circular Linked List",
    "unitIds": [
     "6e70729e77d744ec9277772b78ad94e7"
    ]
   },
   {
    "n": 14,
    "name": "Reversing a Linked List",
    "unitIds": [
     "b8e28fb157484bb3ac28b1838f1de36a"
    ]
   },
   {
    "n": 15,
    "name": "Cycle Detection In Linked List",
    "unitIds": [
     "0555c8423dbe4a428665873f1cd88aee"
    ]
   },
   {
    "n": 16,
    "name": "Length of Cycle In Linked List",
    "unitIds": [
     "cc9780ee05d748e8ae94402fb54b3127"
    ]
   },
   {
    "n": 17,
    "name": "Adding Two Numbers",
    "unitIds": [
     "9554a75f05624c90b67a11edb23ce550"
    ]
   },
   {
    "n": 18,
    "name": "Merge Two Sorted Linked List",
    "unitIds": [
     "17014d63762d43d586a596a0958eeec6"
    ]
   },
   {
    "n": 19,
    "name": "Intersection Of Two Linked Lists",
    "unitIds": [
     "844405d63e3c4793865f5ba028e43865"
    ]
   },
   {
    "n": 20,
    "name": "Flatten a Linked List",
    "unitIds": [
     "f0bed3f3f90a4c4698d93a8688d873be"
    ]
   },
   {
    "n": 21,
    "name": "Introduction of Stack",
    "unitIds": [
     "ffd5e1f6ac64427eb3e08825de0494da"
    ]
   },
   {
    "n": 22,
    "name": "Stack Implementation Using Array",
    "unitIds": [
     "4aa9d6fa385747ed9f212df397cee883"
    ]
   },
   {
    "n": 23,
    "name": "Stack Implementation Using Linked List",
    "unitIds": [
     "4b50cc7c02544be8ba6daf806d9434ee"
    ]
   },
   {
    "n": 24,
    "name": "Introduction to Monotonic Stacks (+ Next Greater Element)",
    "unitIds": [
     "07c8f2bc396b4df197f12a731bd27fe3",
     "f5938e44316b470b9451f7572ffd9576",
     "6ba8b6cf522748dcbe82bbaf4dc02386"
    ]
   },
   {
    "n": 25,
    "name": "Infix, Prefix, and Postfix Notations",
    "unitIds": [
     "5d17cca8e827460fbda41e98fff12755",
     "4c8d26cec29544a083d15a7da8947a91"
    ]
   },
   {
    "n": 26,
    "name": "Implement Min Stack",
    "unitIds": [
     "94135436b8d544b3acc6e0a1bc6e3523"
    ]
   },
   {
    "n": 27,
    "name": "Balanced Parenthesis",
    "unitIds": [
     "62e7b25970f8407d861f2086d0053dcd"
    ]
   },
   {
    "n": 28,
    "name": "Asteroid Collision",
    "unitIds": [
     "c3231d08d11d44f1a88f87643172ea96",
     "56ddecc9f4e14e00bc15f9042941e1ee"
    ]
   },
   {
    "n": 29,
    "name": "Largest Rectangle In Histogram",
    "unitIds": [
     "ec7d727f323344898145c33ff54e54d5",
     "10dc091f062c4fd2b31330153de266bc"
    ]
   },
   {
    "n": 30,
    "name": "Queue - Introduction & Implementation Using Arrays",
    "unitIds": [
     "3386ad2f071a47caab74d5a73d31c5b0"
    ]
   },
   {
    "n": 31,
    "name": "Queue Implementation Using Linked List",
    "unitIds": [
     "83d071ae5456484ca65b7a264d7909f8"
    ]
   },
   {
    "n": 32,
    "name": "Implement Stack Using Queue",
    "unitIds": [
     "186fd8d04b984643afb05d8962bce01d"
    ]
   },
   {
    "n": 33,
    "name": "Implement Queue Using Stack (Part 1 + Part 2)",
    "unitIds": [
     "a6fda7532ee84263894a699f9db5971a",
     "bb0389c22af9437b819e9e3d165b29de"
    ]
   },
   {
    "n": 34,
    "name": "Introduction to Binary Trees",
    "unitIds": [
     "a25d2d17216341b685173eb586f60e6e",
     "6421fce6b3ad48af8d210eb373aae654"
    ]
   },
   {
    "n": 35,
    "name": "Binary Tree Traversals",
    "unitIds": [
     "26262c620f314a88ae9fdb0f6f46af15"
    ]
   },
   {
    "n": 36,
    "name": "Pre-Order Traversal",
    "unitIds": [
     "a75602b547e84921b4d162d59a25ed93",
     "208384d7eb47497e8c6ec939308604d7"
    ]
   },
   {
    "n": 37,
    "name": "In-Order Traversal",
    "unitIds": [
     "ec6e71a9d5dd4d589e5a3612f7e65b19"
    ]
   },
   {
    "n": 38,
    "name": "Post-Order Traversal",
    "unitIds": [
     "99e859a998ed41a2a1e3b664daef3c12"
    ]
   },
   {
    "n": 39,
    "name": "Level Order Traversal",
    "unitIds": [
     "64b29ae792884d329f8da10165418c46",
     "9a64e3d459504f1db9e79eeb77c4a667"
    ]
   },
   {
    "n": 40,
    "name": "Height of a Binary Tree",
    "unitIds": [
     "ae24187699cf4c3495d6bd20986ed9e4"
    ]
   },
   {
    "n": 41,
    "name": "Balanced Binary Tree",
    "unitIds": [
     "f15b86c0770a4e04a18800ea0d87ff99"
    ]
   },
   {
    "n": 42,
    "name": "Diameter Of Binary Tree",
    "unitIds": [
     "07ecaaccdc2e4b388a7ae2989d07289f"
    ]
   },
   {
    "n": 43,
    "name": "Maximum Path Sum of Binary Tree",
    "unitIds": [
     "78800212a96248d2957c9fae7d593712"
    ]
   },
   {
    "n": 44,
    "name": "Top view of Binary Tree",
    "unitIds": [
     "20047473f5db443a9f09d5df9ce76fd7"
    ]
   },
   {
    "n": 45,
    "name": "Right view of Binary Tree",
    "unitIds": [
     "a4b00a46081747d2a45fd556b89d5f21"
    ]
   },
   {
    "n": 46,
    "name": "Lowest Common Ancestor of a Binary Tree",
    "unitIds": [
     "53965a42283647c8a462193d546961db"
    ]
   },
   {
    "n": 47,
    "name": "Introduction to Binary Search Tree",
    "unitIds": [
     "3b63404c46184518acabdc9d3fb67baa"
    ]
   },
   {
    "n": 48,
    "name": "Insertion in Binary Search Tree",
    "unitIds": [
     "e065c5afd0304537a9da11a71234c495"
    ]
   },
   {
    "n": 49,
    "name": "Deletion in Binary Search Tree",
    "unitIds": [
     "6076ce6863c543e6974a1b38d3c4475e"
    ]
   },
   {
    "n": 50,
    "name": "Kth Smallest Element in BST",
    "unitIds": [
     "bbea3156a66248e5bb3e0f8e2f16372c"
    ]
   },
   {
    "n": 51,
    "name": "Validate a Binary Search Tree",
    "unitIds": [
     "040714f21dd84a129c8c84c6d5e20f76"
    ]
   },
   {
    "n": 52,
    "name": "Predecessor and Successor in BST",
    "unitIds": [
     "82e8c9109fd045ce94807ff66b0ea535"
    ]
   },
   {
    "n": 53,
    "name": "Merge Two BSTs",
    "unitIds": [
     "bdfe95bc328d42bda0378d4e8388ecd0"
    ]
   },
   {
    "n": 54,
    "name": "Introduction to Heaps",
    "unitIds": [
     "6677c40befcc4de88d5b5634dd921d30",
     "aa00dc02d98d4ee9b390d6fb8ce6aaf9"
    ]
   },
   {
    "n": 55,
    "name": "Implementation of Binary Heap",
    "unitIds": [
     "6062b6a3274b40a9bb7722efad6d0c42"
    ]
   },
   {
    "n": 56,
    "name": "Heapsort Algorithm",
    "unitIds": [
     "ea4fef167357423595229fdf593081fc",
     "8b608c2af77f46bc83db7badb03852a1"
    ]
   },
   {
    "n": 57,
    "name": "Max Heap Validation",
    "unitIds": [
     "bd02361e7f0143db88bace22323b0e30"
    ]
   },
   {
    "n": 58,
    "name": "Convert Min Heap to Max Heap",
    "unitIds": [
     "8895872bbd1941d6b3afff41bd733074"
    ]
   },
   {
    "n": 59,
    "name": "Kth Largest Element in an Array (Part 1 + Part 2)",
    "unitIds": [
     "4c24d40608de4b35a169fc3005faab33",
     "29ae2136e3a34c568e9d8a831e22071c"
    ]
   },
   {
    "n": 60,
    "name": "Merge K Sorted Arrays",
    "unitIds": [
     "66501e9f91ab4715bc2cae6de0c92464"
    ]
   },
   {
    "n": 61,
    "name": "Top K Frequent Elements",
    "unitIds": [
     "e8b032600e68418b9e392264a00c2df8"
    ]
   }
  ]
 },
 {
  "key": "ai_for_finance",
  "portalKey": "ai_for_finance",
  "title": "AI for Finance",
  "subject": "GenAI",
  "lectures": [
   {
    "n": 1,
    "name": "Your Learning Journey",
    "unitIds": [
     "64032f8d17a34af0b0af57bcc61db69a"
    ]
   },
   {
    "n": 2,
    "name": "Introduction to AI For Finance",
    "unitIds": [
     "a8416d64c8f54753aa41af8bbdae4031"
    ]
   },
   {
    "n": 3,
    "name": "Building Personal Finance Advisor",
    "unitIds": [
     "d6677196da534098b675fe20819b4dd6"
    ]
   },
   {
    "n": 4,
    "name": "Introduction to RAG Evaluation",
    "unitIds": [
     "e7d3c4474b394ba78d53e6a4a6d5f944"
    ]
   },
   {
    "n": 5,
    "name": "Enhancing Productivity with AI",
    "unitIds": [
     "3b7e194c863b473fa48fbcbeb0798156"
    ]
   },
   {
    "n": 6,
    "name": "Building a Trading Agent | Part 1",
    "unitIds": [
     "e63a95228abb49148e2d5f3df2abda15"
    ]
   },
   {
    "n": 7,
    "name": "Building a Trading Agent | Part 2",
    "unitIds": [
     "4f1a247cdd054936bfba9fc95bd57866"
    ]
   },
   {
    "n": 8,
    "name": "Introduction to LLM Observability",
    "unitIds": [
     "6ec60bac852e4a20afd2a4baff59751e"
    ]
   },
   {
    "n": 9,
    "name": "Integrating Langsmith with the trading Agent",
    "unitIds": [
     "f218607eddc8407c8e6101acbe728e17"
    ]
   },
   {
    "n": 10,
    "name": "Building a Financial Fraud Detection Model | Part 1",
    "unitIds": [
     "ca55a534734c4f11acbb91ad47d22015"
    ]
   },
   {
    "n": 11,
    "name": "Building a Financial Fraud Detection Model | Part 2",
    "unitIds": [
     "47aec7e71d83492cbdd06364ec465705"
    ]
   },
   {
    "n": 12,
    "name": "Evaluating the Financial Fraud Detection Model",
    "unitIds": [
     "2691d7fedec748a6b651e32aeab35603"
    ]
   },
   {
    "n": 13,
    "name": "Building a Financial Fraud Detection Agent",
    "unitIds": [
     "6ecae3a430844bea9796c10c92dfdcff"
    ]
   },
   {
    "n": 14,
    "name": "Introduction to AI Ethics",
    "unitIds": [
     "0f3d7b731dd84072bc939cd21d2636ea"
    ]
   },
   {
    "n": 15,
    "name": "Introduction to Responsible AI",
    "unitIds": [
     "ef01fe4f0d3743839b91ddfcf87b4d5e"
    ]
   },
   {
    "n": 16,
    "name": "Building AI Guardrails | Part 1",
    "unitIds": [
     "632996b10ad24515bb1702f0dba8f46c"
    ]
   },
   {
    "n": 17,
    "name": "Building AI Guardrails | Part 2",
    "unitIds": [
     "73633f4d0f1d45168f95f3ad2f0d777f"
    ]
   },
   {
    "n": 18,
    "name": "AI Finance Add-On Session",
    "unitIds": [
     "7f2fa71a2d6d4508b14bcdcdb9530aa2"
    ]
   }
  ]
 },
 {
  "key": "gen_ai",
  "portalKey": "gen_ai",
  "title": "Introduction to Gen AI",
  "subject": "GenAI",
  "lectures": [
   {
    "n": 1,
    "name": "Your Learning Journey",
    "unitIds": [
     "64025833d46d4e7ca7e0a9c230a78b9d"
    ]
   },
   {
    "n": 2,
    "name": "Generative AI Foundations",
    "unitIds": [
     "55622f8db3584a7abfd7a32ee81a41df"
    ]
   },
   {
    "n": 3,
    "name": "Exploring Gen AI Capabilities",
    "unitIds": [
     "e96a1a8c564d448e8ffdb45b9de894f4"
    ]
   },
   {
    "n": 4,
    "name": "Productivity Power Up with AI Tools",
    "unitIds": [
     "e1e7b4a3c28941ea95434562eb1f1b52",
     "60226c2726cf4f9dbf19fc434231e781"
    ]
   },
   {
    "n": 5,
    "name": "Prompt Engineering Fundamentals",
    "unitIds": [
     "ce7280f1375d416591fcf6d4593435f0"
    ]
   },
   {
    "n": 6,
    "name": "Building Social Media Content Automation Workflow | Part - 1",
    "unitIds": [
     "8af9ec3bc76840589d04daeda5d0ec8b"
    ]
   },
   {
    "n": 7,
    "name": "Building Social Media Content Automation Workflow | Part - 2 (+ Setting Up Google OAuth 2.0 for n8n)",
    "unitIds": [
     "f062acff6aea4c698659ba51c4ccbde6",
     "b6d8e5ed77344324add02edc5accefbb"
    ]
   },
   {
    "n": 8,
    "name": "Advanced Prompt Engineering",
    "unitIds": [
     "61d3d704b2e54225a2af3d440779a5f6"
    ]
   },
   {
    "n": 9,
    "name": "Build Your Own AI News Summarizer | Part - 1",
    "unitIds": [
     "7460a29646d24525a03ad7c8278ba82b",
     "deb381fe8aa944b6883afd5a0c617e40"
    ]
   },
   {
    "n": 10,
    "name": "Build Your Own AI News Summarizer | Part - 2",
    "unitIds": [
     "87dd60b06c704fabb5b2a80ef109a96e",
     "be5189fe272d48af9485cb4535a27401"
    ]
   },
   {
    "n": 11,
    "name": "Build Your Own AI News Summarizer | Part - 3",
    "unitIds": [
     "e97d82f0c1d14598ad8c3dae3ebd8442"
    ]
   },
   {
    "n": 12,
    "name": "Productivity Power-Up with AI Tools | Part 2",
    "unitIds": [
     "21a0cf8e35e94c4990ce3e7de9e83307"
    ]
   },
   {
    "n": 13,
    "name": "Mastering Image Generation",
    "unitIds": [
     "f08c1eeaa8e24c2fb7a23c3f2a999745"
    ]
   },
   {
    "n": 14,
    "name": "Setting Up Your Kaggle Environment",
    "unitIds": [
     "309c1c1a87364fce9e2b30a587d16b11"
    ]
   },
   {
    "n": 15,
    "name": "Mastering Image Generation with Stable Diffusion",
    "unitIds": [
     "51d1574ec0a447dfb26f104fa1538e1d"
    ]
   },
   {
    "n": 16,
    "name": "Mastering AI Audio Generation",
    "unitIds": [
     "523803bf5bed4d3db7e136458227e403"
    ]
   },
   {
    "n": 17,
    "name": "Building No-Code Applications with AI",
    "unitIds": [
     "9f24485920884948b3fb95b4125ddd25"
    ]
   },
   {
    "n": 18,
    "name": "Mastering AI Audio Generation using F5-TTS",
    "unitIds": [
     "09c52e0bdbce4eb7a47642227e06c845"
    ]
   },
   {
    "n": 19,
    "name": "Introduction to AI Agents",
    "unitIds": [
     "413008847ef74ad38662c7013c09beaf"
    ]
   },
   {
    "n": 20,
    "name": "Building a Learning Path Generator",
    "unitIds": [
     "c0d61a20d5384d13bdec04b0fbc034db"
    ]
   },
   {
    "n": 21,
    "name": "Build Your Own AI Shopping Assistant | Part 1",
    "unitIds": [
     "9bc68942c2c745ff98d2917d3b7f1812"
    ]
   },
   {
    "n": 22,
    "name": "Build Your Own AI Shopping Assistant | Part 2",
    "unitIds": [
     "accd9c83cb4c4be39414abfd4c80c62a"
    ]
   },
   {
    "n": 23,
    "name": "Building an Agent with Memory",
    "unitIds": [
     "44b27f22901e45b0bc559e0df5ba8b07"
    ]
   },
   {
    "n": 24,
    "name": "Introduction to Model Context Protocol | Part - 1",
    "unitIds": [
     "234d057ce4824835ba6ccf0d800d22a1"
    ]
   },
   {
    "n": 25,
    "name": "Introduction to Model Context Protocol | Part - 2",
    "unitIds": [
     "d9b98a5dd733482fbb10b56130b4db71"
    ]
   }
  ]
 }
];

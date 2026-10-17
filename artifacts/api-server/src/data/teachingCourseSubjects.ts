// Subject of each course instructors TEACH (2026-10-17, per request), for the Contribution tab's "Subject (from sessions)" column.
// The Training Stats course list (trainingCourseTaxonomy.ts) only holds the courses instructors take as their OWN training; the
// courses they teach are different courses with different ids (learning_portal_course_id in niat_instructor_session_schedule_details),
// so most teaching sessions matched nothing ("No match"). This list maps those teaching courses, keyed by course id (lower case, no
// hyphens), to the app's Subject values. Built from _tmp_teaching_courses.ts (Lecture/Practice sessions, last 30 days, 2026-10-17):
// by what the course teaches, cross-checked with the Subject most of its instructors already have.
//
// "Other: <name>" (2026-10-17, per request) = a course that is not one of our subjects (computer-science core, Fundamentals of AI, ...): it is
// SHOWN in the column by its own name, e.g. "Frontend + Operating Systems", but never counts as a subject (nor in the amber mismatch check).
// null = an orientation-type session every instructor attends (Orientation, Intro to Tech, welcome webinars): left out completely.
// A course missing from here and from the training list still shows up as "No match" -- add it here.
export const TEACHING_COURSE_SUBJECTS: Record<string, string | null> = {
  // Frontend
  cf46b9923227407484b2f6867a00360d: "Frontend", // HTML & CSS
  "772ab1a755f44ff992199084d8e4cb5f": "Frontend", // Fundamentals of Web Development
  c16c60f40b294fb2ab29de92c192f859: "Frontend", // JS Programming

  // Backend
  "4b8803cc8ecb42849fcf53c5afd2a93c": "Backend", // Programming Foundations (2026-10-17, per request: Backend)
  "2250340cd8b54fc2b3ff7475b5a4cacf": "Backend", // Linux and Git Essentials (2026-10-17, per request: Backend)
  "38fcea13736b4c4b9886b73cbc143542": "Backend", // Introduction to GIT (2026-10-17, per request: Backend, same as Linux and Git)
  c9dce66d77e94815bed089713b098aae: "Backend", // Backend Development Fundamentals
  "128b8668816b44eb9f0486a571b0b495": "Backend", // More NodeJS Concepts
  cfdb2649f4234446b0b4cb8f4b123d9a: "Backend", // Advanced DBMS
  "25c1a72c216e47e19bc6b2f16c66e0ca": "Backend", // Introduction to Databases
  a3aa84c2ac324ed581a9f050566521e9: "Backend", // DBMS Fundamentals
  d41fdfdfd6f04590a99980278bff4e7a: "Backend", // Django & DRF for Backend Development
  bd0cbe5893d8415c862eee511fb1113e: "Backend", // Programming Foundations with Python
  "03d2336099a1441681cb93e468b8c191": "Backend", // Programming with Python
  "24cafcbeb4c8411b9104e5898fca3b58": "Backend", // Problem-Solving with Python Programming – 1
  ab4964b6d0b34f03bd940001194be389: "Backend", // Integration & Deployment with Python
  "72394c5132534ada9f92838e7b41060f": "Backend", // Core Java
  "43c3b4abeaee4e80b83d95d4819ae44a": "Backend", // Spring Framework
  "3eccf0cc76e04d04899de6703e0caa9d": "Backend", // Hibernate

  // DSA
  "176b34ed85c8496f974b06719b6b4567": "DSA", // Data Structures Using C++
  "34c770296927444ab7fad4dd10869823": "DSA", // DATA STRUCTURE II

  // GenAI
  d8360c969d994614b1da8f3a26ee57df: "GenAI", // Intro to Generative AI (teaching id; the training course has a different id)

  // Artificial Intelligence & Emerging Technologies (DSML)
  // Fundamentals of Artificial Intelligence: two DIFFERENT course ids with the same title, matching none of our Gen AI or DSML course
  // ids or titles -- so a SEPARATE subject of its own, shown by name (2026-10-17, per request; it was GenAI, then AI & Emerging Tech).
  a46f16077e3c4d1ab1d57affa2807404: "Other: Fundamentals of AI", // Fundamentals of Artificial Intelligence
  f6128ca22b4d4f678c3259573928d045: "Other: Fundamentals of AI", // Fundamentals of Artificial Intelligence (second id)
  "1279ae835e4846b391a63e801ec8f676": "Artificial Intelligence & Emerging Technologies", // Machine Learning
  "1db5e0ed95204f6ea5563886a0a227e9": "Artificial Intelligence & Emerging Technologies", // Data visualisation
  "6136802837a14bc3b0e0cbb8ef254ac9": "Artificial Intelligence & Emerging Technologies", // Foundation of Data Science
  "7d689243bfa249a19ed67f3b836733ab": "Artificial Intelligence & Emerging Technologies", // Python for DSML

  // English
  "5e6b262c3aaa480686a6483662c9d0a7": "English", // Introduction to English Language and Communication
  "77b1f18aa2e4413a9515a91c399e4831": "English", // Applied Communicative English (teaching id; the training course has a different id)

  // Maths / Aptitude
  "62b9cbee9709463cbaa4c947671a0d7b": "Maths", // Linear Algebra - AURORA
  a8cf878f094b4c8292a193b64620afd8: "Aptitude", // NUMERICAL ABILITY AND REASONING SKILLS FOR ENGINEERS

  // Interdisciplinary & Applied Sciences
  "81f0b30e5a5e4df0bd1913cd70961bd5": "Interdisciplinary & Applied Sciences", // Applied physics for Data Science
  df44d2172be3406a9eeea39e129d04ce: "Interdisciplinary & Applied Sciences", // Fundamentals of Quantum Physics
  c636614986044e9899e89e530f895777: "Interdisciplinary & Applied Sciences", // Introduction to Quantum Physics
  "2cb08199f3744ca4a94c5d6ff0ea69b5": "Interdisciplinary & Applied Sciences", // Digital Electronics

  // Other courses -- shown by name, not counted as a subject
  "2184c3a471384f5f88531f8a323994ab": "Other: Production Ready Practices", // Production Ready Practices
  "3d3d4f4b2df54db5bed585a3e0164ecd": "Other: Software Engineering", // Practical Software Engineering
  "91b2de7926d14101b4f45156a5649ebf": "Other: Operating Systems", // Operating Systems
  "6e937f2929d54a649e3106eb23f456e1": "Other: Computer Networks", // Computer Networks
  eb1192bcb76c4d6a9d85e50d1d295d81: "Other: Computer Organisation", // Computer Organisation and Architecture
  "23ffdcbd16314fe982b9a144ee788311": "Other: Constitution of India", // Constitution of India
  "515e45c0e7544cd38dd6920cccce649b": "Other: MRV College", // MRV College

  // Orientation-type sessions every instructor attends -- left out completely
  "6193d110a4194c29beba95bcf12d0f68": null, // Intro to Tech
  "7d0368088a26411b966194ec2e0e143e": null, // Orientation
  "18763c94ec7b453da84693e32941f7cb": null, // Welcome Webinar - IIT KGP OCN - Generative and Agentic AI
};

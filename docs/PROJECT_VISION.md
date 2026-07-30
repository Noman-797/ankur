# BoardSnap × Nexus — Project Vision

**BoardSnap × Nexus** is an AI-powered Study OS built for Bangladeshi students that transforms everyday classroom materials into a personalised learning experience. Instead of acting as a generic chatbot, it understands **your classroom, your lectures, your notes, and your exam pattern**.

Students simply take a photo of a messy whiteboard, paste class notes, or add a YouTube lecture link. Powered by Gemma, the system converts these into structured study packs containing clean notes, code explanations, diagrams, flowcharts, flashcards, quizzes, written practice questions, and Listen mode in Bangla or English (with Gemma verbalizing math for natural speech). The Nexus layer adds lecture transcription, intelligent summarisation into the same study-pack format, and contextual Q&A across the active pack plus semester history.

Throughout the semester, every generated study pack is saved into a personal knowledge base (local history), creating a dynamic syllabus map unique to each student. When exam season arrives, students can upload previous question papers, and **Topic Radar** analyses past exam trends, identifies high-weight topics, compares them with the student's study history, highlights knowledge gaps, recommends what to study first, and generates targeted practice questions.

The platform further supports long-term learning through spaced revision, weak-topic coaching, board comparison across classes, and continuous local progress history. Rather than helping students only at the moment they ask a question, **BoardSnap × Nexus** guides them through the entire learning journey—from understanding classroom content, to practising concepts, revising efficiently, and becoming fully exam-ready.

In short, it is **not another AI chatbot**. It is a semester-long AI study companion that turns real classroom content into a personalised learning loop: **Understand → Practice → Revise → Master**.

## Modes

| Mode | What it does |
|---|---|
| **Board** | Whiteboard photos → study pack (vision) |
| **Lecture** | YouTube / pasted text → study pack |
| **Topic Radar** | Past papers × history → importance, gaps, practice |
| **Ask** | Tutor chat over active pack + semester map |
| **Compare** | Diff two board sets |
| **Listen** | BN/EN TTS with spoken math |

## API surface (new)

- `POST /api/lecture` — YouTube and/or text → `StudyPack`
- `POST /api/topic-radar` — paper images/text + history JSON → radar + practice
- `POST /api/ask` — contextual tutor answer
- `POST /api/verbalize` — Gemma speech script for Listen
- `POST /api/speak` — Edge neural TTS (bn/en)

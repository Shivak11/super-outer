# Super-outer Learning

Super-outer Learning adds two optional skills to Claude Code and Codex. Brief me explains the words a field uses before you start building in it. Meditate writes a study of work you have finished, showing how the thing you built works and which parts your decisions changed.

## Brief me

Run it before you start a project in a field you have not built in before:

```
/super-outer-learning:brief-me <field>
```

For example, `/super-outer-learning:brief-me 2D browser game in Phaser`. It returns a glossary of 20 to 25 terms in three groups, three questions that make your brief more specific, a prompt to paste when you start the real project, and an HTML page with a diagram of how the main terms relate. If you agree, it saves the glossary to `.shva/glossaries/` in the project.

## Meditate

Run it after you finish a stretch of work:

```
/super-outer-learning:meditate
```

It reads the session and writes a private HTML study. The study opens with a diagram of the parts you built or changed and what passes between them, and marks each correction you made on the part it changed. It then asks you to predict what one change would do before you open the answer, gives a short principle for each topic, and ends with a page of words that name parts of the diagram, so that you can ask for similar changes more precisely next time. It saves nothing outside the study unless you approve.

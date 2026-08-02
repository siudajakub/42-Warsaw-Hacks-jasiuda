import assert from "node:assert/strict";
import test from "node:test";
import { isExamProject, isWorkExperienceProject } from "@/lib/commoncore";

test("Common Core exams are classified by stable project id", () => {
  assert.equal(isExamProject({ id: 1320, name: "renamed upstream" }), true);
  assert.equal(isExamProject({ id: 1324, slug: "unexpected-slug" }), true);
});

test("exam classification has a defensive API-name fallback", () => {
  assert.equal(isExamProject({ slug: "exam-rank-03" }), true);
  assert.equal(isExamProject({ name: "Exam Rank 05" }), true);
  assert.equal(isExamProject({ id: 1327, name: "get_next_line" }), false);
});

test("work experience and internship projects are classified defensively", () => {
  assert.equal(isWorkExperienceProject({ name: "Work Experience" }), true);
  assert.equal(isWorkExperienceProject({ name: "Work Experience 1" }), true);
  assert.equal(isWorkExperienceProject({ slug: "42cursus-work-experience" }), true);
  assert.equal(isWorkExperienceProject({ name: "Part-time Internship" }), true);
  assert.equal(isWorkExperienceProject({ slug: "internship-i" }), true);
  assert.equal(isWorkExperienceProject({ name: "Contract" }), true);
  assert.equal(isWorkExperienceProject({ name: "push_swap", slug: "push_swap" }), false);
});

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: plain static HTML, CSS and JavaScript modules, with Node standard-library tests. The brief requires offline operation, zero runtime dependencies and no accounts or network.

## Users

A teacher or school staff member who maintains a course page and needs a fast accessibility check before students depend on it. The affected learner is a student using a screen reader, keyboard-only navigation, or low-vision settings who must find the week's reading and submit an assignment.

## Product Purpose

A11yClass turns pasted course-page HTML into a concrete, prioritized accessibility repair list. It exists to surface barriers before a student hits them. Success means a teacher can identify the exact element, understand why it blocks access, apply the suggested fix, and hand a concise summary to IT.

## Positioning

Unlike hosted accessibility scanners, A11yClass is a small offline source auditor that requires no URL, account, upload, network or student data. Unlike a generic checklist, it names the element, severity, learner impact and repair for each finding.

## Operating Context

Teachers paste synthetic or permission-cleared course-page HTML. The prototype ships only synthetic examples and never needs private student records or grades. It is intended as a triage tool before deeper testing with browsers, assistive technology and disabled users.

## Capabilities and Constraints

- Static client-side audit of pasted HTML.
- Eight named checklist areas: language, headings, form labels, image alternatives, link text, color contrast, focus order and table headers.
- Per-check results, exact element references, severity, concrete repairs, a ranked first-three list, and a printable IT handoff.
- The score is checklist coverage only, never WCAG certification.
- Static source parsing cannot execute JavaScript, load CSS, measure rendering, or replace assistive-technology testing.

## Brand Commitments

The product name is A11yClass. Copy must be plain, honest and teacher-facing. No compliance claims.

## Evidence on Hand

Synthetic course-page fixtures in `samples/`; no real student records, grades, names or institutional data.

## Product Principles

1. Offline and privacy-preserving by default.
2. Actionable evidence beats abstract scores.
3. Heuristics must name their assumptions.
4. Accessibility is a learner-access task, not a compliance badge.

## Accessibility & Inclusion

The auditor itself must be keyboard operable, screen-reader understandable, high contrast and printable. The intended beneficiary is a learner using a screen reader or keyboard-only navigation.

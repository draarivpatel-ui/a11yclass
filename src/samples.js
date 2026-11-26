// Generated from the files in samples/ so the static app never fetches fixture HTML.
export const SAMPLES = [
  {
    "id": "problem",
    "title": "Needs repair course page",
    "description": "A synthetic teacher page with many common barriers.",
    "html": "<!doctype html>\n<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>Week 6 course page</title>\n</head>\n<body class=\"bg-white\">\n  <header>\n    <h2>Week 6 Ecosystems</h2>\n    <p style=\"color: #8a8a8a; background: white\">Read the directions before Friday.</p>\n  </header>\n  <main>\n    <h1>Materials</h1>\n    <h1>Week overview</h1>\n    <h4>Reading assignments</h4>\n    <p class=\"text-gray-400 bg-white\">The reading response is due before class.</p>\n    <img src=\"ecosystem-food-web.png\">\n    <img src=\"pond-photo.jpg\" alt=\"image\">\n    <section>\n      <h4>Reflection response</h4>\n      <input id=\"student-response\" name=\"response\" placeholder=\"Type your answer\">\n      <label for=\"missing-field\">Reflection response</label>\n      <div class=\"submission-card\" onclick=\"submitAssignment()\">Submit assignment</div>\n    </section>\n    <p><a href=\"week-6-reading.pdf\">click here</a></p>\n    <p><a href=\"rubric.html\" tabindex=\"4\">Week 6 rubric</a></p>\n    <table>\n      <tr><td>Monday</td><td>Read chapter 6</td><td>20 minutes</td></tr>\n      <tr><td>Wednesday</td><td>Field notes</td><td>30 minutes</td></tr>\n      <tr><td>Friday</td><td>Reflection due</td><td>15 minutes</td></tr>\n    </table>\n  </main>\n</body>\n</html>\n"
  },
  {
    "id": "borderline",
    "title": "Borderline course page",
    "description": "A synthetic teacher page that mostly works but still needs human review.",
    "html": "<!doctype html>\n<html lang=\"english-us\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>Week 7 course page</title>\n</head>\n<body>\n  <main>\n    <h1>Week 7 Energy and Matter</h1>\n    <h2>Reading</h2>\n    <p style=\"color: #767676; background-color: #ffffff\">Complete the reading before attempting the response.</p>\n    <h4>Submission steps</h4>\n    <img src=\"atoms-decorative-rule.png\" alt=\"\">\n    <img src=\"energy-diagram.png\" alt=\"image of energy diagram\">\n    <label for=\"answer\">Energy response</label>\n    <input id=\"answer\" name=\"answer\" type=\"text\">\n    <span id=\"answer\">Duplicate helper id</span>\n    <p><a href=\"chapter-7.pdf\">click here</a></p>\n    <div role=\"button\" tabindex=\"0\" onclick=\"openSubmission()\">Open submission form</div>\n    <table>\n      <caption>Week 7 tasks</caption>\n      <tr><th>Day</th><th>Task</th></tr>\n      <tr><td>Tuesday</td><td>Read chapter 7</td></tr>\n      <tr><td>Thursday</td><td>Submit response</td></tr>\n    </table>\n  </main>\n</body>\n</html>\n"
  },
  {
    "id": "repaired",
    "title": "Repaired course page",
    "description": "A synthetic repaired page used as the passing fixture.",
    "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <title>Week 8 course page</title>\n</head>\n<body>\n  <main>\n    <h1>Week 8 Systems and Feedback</h1>\n    <section>\n      <h2>Reading for this week</h2>\n      <p>Read the systems chapter and annotate one feedback loop.</p>\n      <img src=\"feedback-loop.png\" alt=\"Diagram showing a thermostat feedback loop with sensor, controller and heater\">\n      <p><a href=\"week-8-reading.pdf\">Read the week 8 systems chapter PDF</a></p>\n    </section>\n    <section>\n      <h2>Submit your reflection</h2>\n      <h3>Reflection response</h3>\n      <label for=\"reflection\">Reflection response</label>\n      <textarea id=\"reflection\" name=\"reflection\" rows=\"6\"></textarea>\n      <button type=\"submit\">Submit reflection</button>\n    </section>\n    <table>\n      <caption>Week 8 schedule</caption>\n      <tr><th scope=\"col\">Day</th><th scope=\"col\">Task</th><th scope=\"col\">Time</th></tr>\n      <tr><th scope=\"row\">Monday</th><td>Read chapter 8</td><td>20 minutes</td></tr>\n      <tr><th scope=\"row\">Friday</th><td>Reflection due</td><td>15 minutes</td></tr>\n    </table>\n  </main>\n</body>\n</html>\n"
  }
];

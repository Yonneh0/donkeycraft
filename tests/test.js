(function () {
    'use strict';

    /**
     * TestFramework — shared testing utilities for all Donkeycraft phase/milestone tests.
     *
     * Usage in test files:
     *   <script src="test.js"></script>
     *   <script>
     *   (function() {
     *       'use strict';
     *       var F = TestFramework;
     *
     *       F.section('My Test Section');
     *       F.assert(true, 'This should pass');
     *       F.assertEq(2 + 2, 4, 'Math works');
     *
     *       // When done:
     *       F.finishTests();
     *   })();
     *   </script>
     */

    window.TestFramework = (function () {
        var totalTests = 0;
        var passedTests = 0;
        var failedTests = 0;
        var currentSection = null;
        var resultsContainer = null;
        var summaryContainer = null;

        /**
         * Initialize the test framework.
         * Creates the summary container at the top and results container below.
         * @param {string} [resultsId=results] — The id of the existing results div, or it will be created.
         * @returns {HTMLElement} The results container element.
         */
        function init(resultsId) {
            resultsId = resultsId || 'results';

            // Create summary at top if not exists
            summaryContainer = document.getElementById('test-summary');
            if (!summaryContainer) {
                summaryContainer = document.createElement('div');
                summaryContainer.id = 'test-summary';
                summaryContainer.className = 'pending';
                summaryContainer.innerHTML = '<strong>RUNNING TESTS</strong> — 0/0 passed';
                document.body.insertBefore(summaryContainer, document.body.firstChild);
            }

            // Use existing results div or create one
            resultsContainer = document.getElementById(resultsId);
            if (!resultsContainer) {
                resultsContainer = document.createElement('div');
                resultsContainer.id = resultsId;
                document.body.appendChild(resultsContainer);
            }

            return resultsContainer;
        }

        /**
         * Start a new test section.
         * @param {string} name — Section heading text.
         * @returns {HTMLElement} The section div element.
         */
        function section(name) {
            var div = document.createElement('div');
            div.className = 'section';
            var heading = document.createElement('h2');
            heading.textContent = name;
            div.appendChild(heading);
            resultsContainer.appendChild(div);
            currentSection = div;
            return div;
        }

        /**
         * Basic boolean assertion.
         * @param {boolean} condition — The condition to test.
         * @param {string} message — Description of the test.
         */
        function assert(condition, message) {
            totalTests++;
            var div = document.createElement('div');
            if (condition) {
                passedTests++;
                div.className = 'test pass';
                div.textContent = '\u2713 PASS: ' + message;
            } else {
                failedTests++;
                div.className = 'test fail';
                div.innerHTML = '\u2717 FAIL: ' + message + '<div class="detail">Assertion failed.</div>';
            }
            currentSection.appendChild(div);
        }

        /**
         * Equality assertion (strict ===).
         * @param {*} actual — The actual value.
         * @param {*} expected — The expected value.
         * @param {string} message — Description of the test.
         */
        function assertEq(actual, expected, message) {
            totalTests++;
            if (actual === expected) {
                passedTests++;
                var div = document.createElement('div');
                div.className = 'test pass';
                div.textContent = '\u2713 PASS: ' + message;
                currentSection.appendChild(div);
            } else {
                failedTests++;
                var div = document.createElement('div');
                div.className = 'test fail';
                div.innerHTML = '\u2717 FAIL: ' + message + '<div class="detail">Expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '</div>';
                currentSection.appendChild(div);
            }
        }

        /**
         * Near-equality assertion for floating point comparison.
         * @param {number} actual — The actual value.
         * @param {number} expected — The expected value.
         * @param {number} epsilon — Maximum acceptable difference.
         * @param {string} message — Description of the test.
         */
        function assertNear(actual, expected, epsilon, message) {
            totalTests++;
            if (Math.abs(actual - expected) < epsilon) {
                passedTests++;
                var div = document.createElement('div');
                div.className = 'test pass';
                div.textContent = '\u2713 PASS: ' + message;
                currentSection.appendChild(div);
            } else {
                failedTests++;
                var div = document.createElement('div');
                div.className = 'test fail';
                div.innerHTML = '\u2717 FAIL: ' + message + '<div class="detail">Expected ~' + expected + ', got ' + actual + ' (delta=' + Math.abs(actual - expected) + ', epsilon=' + epsilon + ')</div>';
                currentSection.appendChild(div);
            }
        }

        /**
         * Type assertion.
         * @param {*} val — The value to check.
         * @param {string} type — Expected type string ('number', 'string', 'boolean', 'function', 'object', 'undefined').
         * @param {string} message — Description of the test.
         */
        function assertType(val, type, message) {
            totalTests++;
            if (typeof val === type) {
                passedTests++;
                var div = document.createElement('div');
                div.className = 'test pass';
                div.textContent = '\u2713 PASS: ' + message;
                currentSection.appendChild(div);
            } else {
                failedTests++;
                var div = document.createElement('div');
                div.className = 'test fail';
                div.innerHTML = '\u2717 FAIL: ' + message + '<div class="detail">Expected type "' + type + '", got "' + typeof val + '"</div>';
                currentSection.appendChild(div);
            }
        }

        /**
         * Array equality assertion.
         * @param {Array} actual — The actual array.
         * @param {Array} expected — The expected array.
         * @param {string} message — Description of the test.
         */
        function assertArrEq(actual, expected, message) {
            totalTests++;
            if (actual.length !== expected.length) {
                failedTests++;
                var div = document.createElement('div');
                div.className = 'test fail';
                div.innerHTML = '\u2717 FAIL: ' + message + '<div class="detail">Length mismatch: ' + actual.length + ' vs ' + expected.length + '</div>';
                currentSection.appendChild(div);
                return;
            }
            for (var i = 0; i < actual.length; i++) {
                if (actual[i] !== expected[i]) {
                    failedTests++;
                    var div3 = document.createElement('div');
                    div3.className = 'test fail';
                    div3.innerHTML = '\u2717 FAIL: ' + message + '<div class="detail">Index ' + i + ': expected ' + JSON.stringify(expected[i]) + ', got ' + JSON.stringify(actual[i]) + '</div>';
                    currentSection.appendChild(div3);
                    return;
                }
            }
            passedTests++;
            var div2 = document.createElement('div');
            div2.className = 'test pass';
            div2.textContent = '\u2713 PASS: ' + message;
            currentSection.appendChild(div2);
        }

        /**
         * Display an informational message (yellow, italic).
         * @param {string} msg — The message to display.
         */
        function info(msg) {
            var div = document.createElement('div');
            div.className = 'info-msg';
            div.textContent = '>> ' + msg;
            currentSection.appendChild(div);
        }

        /**
         * Finalize tests and render the summary at the top of the page.
         * Updates the #test-summary element with pass/fail counts.
         */
        function finishTests() {
            if (!summaryContainer) return;

            if (failedTests === 0) {
                summaryContainer.className = 'pass';
                summaryContainer.innerHTML = '<strong>ALL TESTS PASSED</strong> \u2014 ' + passedTests + '/' + totalTests;
            } else {
                summaryContainer.className = 'fail';
                summaryContainer.innerHTML = '<strong>TESTS FAILED</strong> \u2014 ' + passedTests + '/' + totalTests + ' passed, ' + failedTests + ' failed';
            }
        }

        /**
         * Reset the framework counters (for running multiple test suites in one page).
         */
        function reset() {
            totalTests = 0;
            passedTests = 0;
            failedTests = 0;
            currentSection = null;
        }

        return {
            init: init,
            section: section,
            assert: assert,
            assertEq: assertEq,
            assertNear: assertNear,
            assertType: assertType,
            assertArrEq: assertArrEq,
            info: info,
            finishTests: finishTests,
            reset: reset,
            // Expose counters for direct access
            get totalTests() { return totalTests; },
            get passedTests() { return passedTests; },
            get failedTests() { return failedTests; }
        };
    })();

})();
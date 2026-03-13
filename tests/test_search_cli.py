import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SEARCH = ROOT / "src/ui-ux-pro-max/scripts/search.py"
CLI_SEARCH = ROOT / "cli/assets/scripts/search.py"


def run_search(script: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(script), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


class SearchCliRegressionTests(unittest.TestCase):
    def test_design_system_uses_color_csv_headers(self) -> None:
        expected_hexes = [
            "#7C3AED",
            "#A78BFA",
            "#F43F5E",
            "#0F0F23",
            "#E2E8F0",
        ]

        for script in (SOURCE_SEARCH, CLI_SEARCH):
            with self.subTest(script=script):
                result = run_search(script, "gaming app", "--design-system", "-f", "markdown")

                self.assertEqual(result.returncode, 0, msg=result.stderr)
                for hex_value in expected_hexes:
                    self.assertIn(hex_value, result.stdout)

    def test_stack_search_supports_documented_stacks(self) -> None:
        stack_queries = {
            "react": "useState",
            "nextjs": "App Router",
            "html-tailwind": "animate-pulse",
        }

        for script in (SOURCE_SEARCH, CLI_SEARCH):
            for stack, query in stack_queries.items():
                with self.subTest(script=script, stack=stack):
                    result = run_search(script, query, "--stack", stack)

                    self.assertEqual(result.returncode, 0, msg=result.stderr)
                    self.assertIn(f"**Stack:** {stack}", result.stdout)
                    self.assertIn(f"stacks/{stack}.csv", result.stdout)


if __name__ == "__main__":
    unittest.main()

"""Run the real promtool rule evaluator on four synthetic CPU fixtures."""
import json
from pathlib import Path
import subprocess
import sys


def main(binary):
    executable = str(Path(binary).resolve()) if "/" in binary else binary
    directory = Path(__file__).resolve().parent
    commands = []
    for arguments in [("check", "rules", "cpu.rules.yaml"), ("test", "rules", "cpu.test.yaml")]:
        result = subprocess.run([executable, *arguments], cwd=directory,
                                capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        commands.append({"command": "promtool " + " ".join(arguments), "exit_code": 0})
    version = subprocess.run([executable, "--version"], capture_output=True, text=True, check=True)
    print(json.dumps({"version": (version.stdout + version.stderr).splitlines()[0],
                      "commands": commands, "fixture_groups": 4,
                      "checks": {"different_requests": {"weighted_ratio": 0.18, "wrong_pod_mean": 0.5},
                                 "missing_metric": {"naive_ratio": 0.09, "complete": 0},
                                 "observed_zero": {"ratio": 0, "complete": 1},
                                 "absent": "no_result_not_zero"},
                      "scope": "actual_promtool_on_synthetic_gauges_not_metrics_server_or_hpa"},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "promtool")


#!/usr/bin/env python3
import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"[assert-pi-json] {message}", file=sys.stderr)
    raise SystemExit(1)


if len(sys.argv) < 3:
    fail(
        "usage: assert-pi-json.py <jsonl-file> <tool-name> [key=value expected args...]",
    )

jsonl_path = Path(sys.argv[1])
tool_name = sys.argv[2]
expected_args: dict[str, object] = {}
expected_details: dict[str, object] = {}
expected_queue: dict[str, list[object]] = {"followUp": [], "steering": []}


def parse_expected_value(value: str) -> object:
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    return value


for raw in sys.argv[3:]:
    if "=" not in raw:
        fail(f"invalid expected arg {raw!r}; expected key=value")
    key, value = raw.split("=", 1)
    expected_value = parse_expected_value(value)
    if key.startswith("details."):
        expected_details[key.removeprefix("details.")] = expected_value
    elif key == "queue.followUp":
        expected_queue["followUp"].append(expected_value)
    elif key == "queue.steering":
        expected_queue["steering"].append(expected_value)
    else:
        expected_args[key] = expected_value

if not jsonl_path.exists():
    fail(f"file does not exist: {jsonl_path}")

lines = [line for line in jsonl_path.read_text().splitlines() if line.strip()]
events = [json.loads(line) for line in lines]

queue_updates = [event for event in events if event.get("type") == "queue_update"]
for queue_name, expected_values in expected_queue.items():
    for expected_value in expected_values:
        if not any(expected_value in event.get(queue_name, []) for event in queue_updates):
            fail(f"did not observe queue_update {queue_name} containing {expected_value!r}")

starts = [
    event
    for event in events
    if event.get("type") == "tool_execution_start"
    and event.get("toolName") == tool_name
]
if not starts:
    fail(f"did not observe tool_execution_start for {tool_name}")

for key, expected_value in expected_args.items():
    actual_value = starts[0].get("args", {}).get(key)
    if actual_value != expected_value:
        fail(
            f"expected first {tool_name} call arg {key}={expected_value!r}, got {actual_value!r}",
        )

ends = [
    event
    for event in events
    if event.get("type") == "tool_execution_end"
    and event.get("toolName") == tool_name
]
if not ends:
    fail(f"did not observe tool_execution_end for {tool_name}")

if any(event.get("isError") for event in ends):
    fail(f"observed failing {tool_name} execution")


def get_path(value: object, path: str) -> object:
    current = value
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


first_result_details = ends[0].get("result", {}).get("details", {})
for key, expected_value in expected_details.items():
    actual_value = get_path(first_result_details, key)
    if actual_value != expected_value:
        fail(
            f"expected first {tool_name} result detail {key}={expected_value!r}, got {actual_value!r}",
        )

assistant_messages = []
for event in events:
    if event.get("type") != "message_end":
        continue
    message = event.get("message", {})
    if message.get("role") != "assistant":
        continue

    text_parts = []
    for content in message.get("content", []):
        if content.get("type") == "text":
            text_parts.append(content.get("text", ""))

    if text_parts:
        assistant_messages.append("\n".join(text_parts))

if not assistant_messages:
    fail("did not observe any assistant text response")

print(
    json.dumps(
        {
            "tool": tool_name,
            "starts": len(starts),
            "ends": len(ends),
            "assistantPreview": assistant_messages[-1][:240],
        },
        ensure_ascii=False,
    ),
)

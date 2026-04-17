use serde::Deserialize;

/// A single JSONL line in a Claude Code session transcript. We only
/// decode the fields we care about; unknown fields are ignored.
#[derive(Debug, Clone, Deserialize)]
pub struct JsonlLine {
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(default)]
    pub message: Option<Message>,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default, rename = "sessionId")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub content: Option<serde_json::Value>,
    #[serde(default)]
    pub model: Option<String>,
}

/// A condensed turn suitable for building a summary prompt.
#[derive(Debug, Clone)]
pub struct SessionTurn {
    pub role: String,               // "user" | "assistant" | "system"
    pub text: String,               // extracted plain text (concatenated if content is an array)
    pub tool_names: Vec<String>,    // names of tool_use blocks in an assistant turn
    pub timestamp: Option<String>,
}

pub fn parse_line(line: &str) -> Option<JsonlLine> {
    serde_json::from_str::<JsonlLine>(line).ok()
}

pub fn condense(line: &JsonlLine) -> Option<SessionTurn> {
    let msg = line.message.as_ref()?;
    let role = msg.role.clone().unwrap_or_else(|| "unknown".to_string());
    let (text, tool_names) = extract_text_and_tools(msg.content.as_ref()?);
    if text.is_empty() && tool_names.is_empty() {
        return None;
    }
    Some(SessionTurn { role, text, tool_names, timestamp: line.timestamp.clone() })
}

fn extract_text_and_tools(content: &serde_json::Value) -> (String, Vec<String>) {
    let mut texts: Vec<String> = Vec::new();
    let mut tools: Vec<String> = Vec::new();
    match content {
        serde_json::Value::String(s) => texts.push(s.clone()),
        serde_json::Value::Array(items) => {
            for item in items {
                match item.get("type").and_then(|v| v.as_str()) {
                    Some("text") => {
                        if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                            texts.push(t.to_string());
                        }
                    }
                    Some("tool_use") => {
                        if let Some(n) = item.get("name").and_then(|v| v.as_str()) {
                            tools.push(n.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
    (texts.join("\n"), tools)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_line_survives_unknown_fields() {
        let line = r#"{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-04-16T10:00:00Z","extra":"ignored"}"#;
        let parsed = parse_line(line).expect("should parse");
        assert_eq!(parsed.r#type.as_deref(), Some("user"));
        let turn = condense(&parsed).expect("should condense");
        assert_eq!(turn.role, "user");
        assert_eq!(turn.text, "hi");
        assert!(turn.tool_names.is_empty());
    }

    #[test]
    fn condense_extracts_text_and_tool_names_from_array_content() {
        let line = r#"{"message":{"role":"assistant","content":[
            {"type":"text","text":"I'm going to edit the file."},
            {"type":"tool_use","name":"Edit","input":{}}
        ]}}"#;
        let parsed = parse_line(line).expect("should parse");
        let turn = condense(&parsed).expect("should condense");
        assert_eq!(turn.role, "assistant");
        assert_eq!(turn.text, "I'm going to edit the file.");
        assert_eq!(turn.tool_names, vec!["Edit".to_string()]);
    }

    #[test]
    fn condense_returns_none_for_empty_content() {
        let line = r#"{"message":{"role":"assistant","content":[]}}"#;
        let parsed = parse_line(line).expect("should parse");
        assert!(condense(&parsed).is_none());
    }

    #[test]
    fn parse_line_rejects_invalid_json() {
        assert!(parse_line("not json").is_none());
        assert!(parse_line("").is_none());
    }
}

//! tree-sitter-lingrep grammar for Rust
//!
//! This crate provides the tree-sitter grammar for the lingrep patterns.

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_lingrep() -> *const ();
}

/// The tree-sitter [`LanguageFn`][LanguageFn] for this grammar.
///
/// [LanguageFn]: https://docs.rs/tree-sitter-language/*/tree_sitter_language/struct.LanguageFn.html
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_lingrep) };

/// The content of the [`node-types.json`][] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers#static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

/// The content of the `grammar.json` file for this grammar.
pub const GRAMMAR_JSON: &str = include_str!("../../src/grammar.json");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_exists() {
        // Just verify the LANGUAGE constant can be referenced
        let _lang = LANGUAGE;
    }

    #[test]
    fn test_grammar_source_exists() {
        assert!(!GRAMMAR_JSON.is_empty());
        assert!(!NODE_TYPES.is_empty());
    }
}

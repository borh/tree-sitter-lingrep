package tree_sitter_lingrep_test

import (
	"testing"

	tree_sitter_lingrep "github.com/borh/tree-sitter-lingrep/bindings/go"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_lingrep.Language())
	if language == nil {
		t.Fatalf("Error loading Lingrep grammar")
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(language); err != nil {
		t.Fatalf("Error setting Lingrep language: %v", err)
	}
}

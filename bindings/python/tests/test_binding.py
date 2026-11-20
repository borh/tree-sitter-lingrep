from unittest import TestCase

from tree_sitter import Language, Parser, Query
import tree_sitter_lingrep


class TestLanguage(TestCase):
    def test_can_load_grammar(self):
        try:
            Parser(Language(tree_sitter_lingrep.language()))
        except Exception:
            self.fail("Error loading Lingrep grammar")

    def test_packaged_queries_compile_against_the_packaged_language(self):
        language = Language(tree_sitter_lingrep.language())
        for source in (tree_sitter_lingrep.HIGHLIGHTS_QUERY, tree_sitter_lingrep.INJECTIONS_QUERY):
            self.assertIsInstance(source, str)
            Query(language, source)

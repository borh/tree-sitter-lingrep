import XCTest
import SwiftTreeSitter
import TreeSitterLingrep

final class TreeSitterLingrepTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_lingrep())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Lingrep grammar")
    }
}

// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "TreeSitterLingrep",
    products: [
        .library(name: "TreeSitterLingrep", targets: ["TreeSitterLingrep"]),
    ],
    dependencies: [
        .package(name: "SwiftTreeSitter", url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.25.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterLingrep",
            dependencies: [],
            path: ".",
            sources: [
                "src/parser.c",
                // NOTE: if your language has an external scanner, add it here.
            ],
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift",
            cSettings: [.headerSearchPath("src")]
        ),
        .testTarget(
            name: "TreeSitterLingrepTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterLingrep",
            ],
            path: "bindings/swift/TreeSitterLingrepTests"
        )
    ],
    cLanguageStandard: .c11
)

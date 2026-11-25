; Comments and metadata
(comment) @comment

; Metadata: keys, values, and the two block keywords. Metadata is parsed
; syntax, not an opaque line, so a key highlights as a property and a value by
; its type rather than the whole region fading to a documentation comment.
(metadata_entry key: (identifier) @property)
(key_entry key: (identifier) @property)
(skip_entry key: (identifier) @property)
(match_key_projection attribute: (attribute_key) @property)
(deep_key_projection "deep" @function.builtin)
(deep_relation_label) @string.special
(capture_key_projection
  component: (capture_component)? @constant.builtin
  attribute: [(attribute_key) (edge_relation)] @property)
(lexical_term_projection) @constant.builtin
(lexical_segments_projection
  "segments" @function.builtin
  attribute: (attribute_key) @property)
(metadata_map_entry key: (identifier) @property)
(schema_entry key: (identifier) @property)
(schema_entry required: _ @keyword)
(metadata_value_set "in" @keyword)
(metadata_string) @string
(metadata_number) @number
(metadata_boolean) @boolean
; `none` unsets a file default and is a builtin word, not an authored string,
; so it takes the constant face.
(metadata_none) @constant.builtin
(metadata_type) @type
(bundle_block "bundle" @keyword name: (identifier) @entity.name.function)
(bundle_block "end" @keyword)
(bundle_use "use" @keyword "@" @operator name: (identifier) @variable.member)
(override_entry "override" @keyword)
(interpret_entry
  "interpret" @keyword
  "as" @keyword
  role: (identifier) @variable.member)
(classify_entry "classify" @keyword "by" @keyword role: (identifier) @variable.member)
(defaults_block "defaults" @keyword)
(defaults_block "end" @keyword)
(schema_block "schema" @keyword)
(schema_block "end" @keyword)
(labels_entry "labels" @keyword)
(labels_field attribute: (attribute_key) @property)
(analyzer_entry "analyzer" @keyword)
(analyzer_family_field key: (identifier) @property)
(analyzer_resource_field key: (identifier) @property)
(analyzer_split_field key: (identifier) @property)
(analyzer_segmentation_field key: (identifier) @property)
(analyzer_identifier) @string
(sudachi_split) @string
(segmentation_mode) @string

; Policy: a third block keyword, and a verb that is a keyword only inside it.
; The argument key highlights as a property for the same reason a metadata key
; does; an enum is a bare value, so it takes the constant face.
(policy_block "policy" @keyword)
(policy_block "end" @keyword)
(policy_verb) @keyword
(policy_subject "all" @keyword)
(policy_subject "patterns" @keyword)
(policy_argument key: (identifier) @property)
(policy_map_entry key: (identifier) @property)
(policy_enum) @constant
(group_ref
  "%" @operator
  (identifier) @variable.member)

; Pattern definitions
(pattern_definition
  (definition_kind)? @keyword
  (identifier) @entity.name.function
  ":=" @keyword.operator.definition)

(lexicon_definition
  "lexicon" @keyword
  name: (identifier) @entity.name.function
  "by" @keyword
  ":=" @keyword.operator.definition)
(lexicon_definition attribute: (attribute_key) @property)


; Set declarations. The keyword takes the same face as `pattern`/`fragment`,
; and the name the same face as a definition name, because a reader scans for
; all three the same way.
(set_definition
  "set" @keyword
  (identifier) @entity.name.function
  ":=" @keyword.operator.definition)

; Test declarations. Same reasoning and same faces as `set_definition`: a
; test names a predicate, not an expression, but a reader still scans for it
; the way they scan for `pattern`, `fragment`, and `set`.
(test_definition
  "test" @keyword
  (identifier) @entity.name.function
  ":=" @keyword.operator.definition)

; Group declarations use the same faces as set/test definitions; the
; predicate key is a metadata key and its operators take the attribute-operator
; face.
(group_definition
  "group" @keyword
  (identifier) @entity.name.function
  ":=" @keyword.operator.definition)

(group_predicate
  key: (identifier) @property)

(group_operator) @operator

; Operators and punctuation. `&` and `|` are anonymous wherever they appear, so
; the token-test algebra's conjunction and disjunction are already covered; `!`
; is scoped to the node that can hold it, and is the one glyph in the algebra
; whose meaning diverges from its `!=` neighbour.
"&" @operator
"|" @operator
(test_negation "!" @operator)
(relation_negation) @operator
(order_constraint "<" @operator)
(anonymous_dependency_node) @constant.builtin
"." @punctuation.delimiter

; Node patterns
(node_pattern
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

(key_projection_list
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

(attribute attribute: (attribute_key) @property)
(attribute operator: _ @operator)
; A regex value is a `value` node with a `regex` child of the same span; the
; predicate leaves that span to the `regex` rule alone.
((value) @string
 (#not-match? @string "^/.*/$"))
(attribute values: (value_set) @string)

(attribute ">=" @operator)
(similarity_threshold) @number
(vectors_entry "vectors" @keyword)
(vectors_resource_field key: (identifier) @property)
(vectors_digest_field key: (identifier) @property (vectors_digest) @string)

(sentence_start) @punctuation.special
(sentence_end) @punctuation.special
["preceded_by" "not_preceded_by" "followed_by" "not_followed_by"] @keyword
"within" @keyword
(preceded_by scope: (identifier) @constant.builtin)
(not_preceded_by scope: (identifier) @constant.builtin)
(followed_by scope: (identifier) @constant.builtin)
(not_followed_by scope: (identifier) @constant.builtin)
(any_order "any_order" @keyword)
(same_as "same_as" @keyword "by" @keyword)
(same_as attribute: (attribute_key) @property)

; Regex patterns
(regex) @string.regex

; Bare patterns and references
(bare_element) @variable

(pattern_reference
  "@" @operator
  (identifier) @variable.member)

(set_reference
  "@" @operator
  (identifier) @variable.member)

; A test reference takes the same faces as the other two: `@X` has one
; referent whichever kind `X` is.
(test_reference
  "@" @operator
  (identifier) @variable.member)

; Special syntax
(named_group
  "(?<" @punctuation.special
  (identifier) @variable.parameter
  ">" @punctuation.special)

(parenthesized_pattern
  "(" @punctuation.bracket
  ")" @punctuation.bracket)

; Grouping inside `[…]`, which is a different node from the expression-level
; grouping above and would otherwise be the only unstyled bracket pair.
(parenthesized_test
  "(" @punctuation.bracket
  ")" @punctuation.bracket)

; Quantifiers
(quantifier) @operator
(dependent_count) @operator
(attribute_comparison operator: _ @operator)

(where_clause "where" @keyword)
(relation_kind) @keyword
(basic_head_endpoint "basic_head" @function.builtin)
["-[" "]->"] @operator
(relation_constraint path: _ @operator)
(relation_constraint boundary: _ @keyword)
(relation_label) @string.special
(any_relation) @constant.builtin

(span_constraint "span" @keyword)
(span_constraint "->" @operator)
((tree_source layer: (span_layer_name) @constant.builtin)
 (#any-of? @constant.builtin "word" "bunsetsu"))
((tree_source layer: (span_layer_name) @property)
 (#not-any-of? @property "word" "bunsetsu"))
(span_constraint layer: (span_layer_name) @property)
(span_operand position: (identifier) @property)
(span_operand label: (identifier) @string)

(capture_reference "$" @operator name: (identifier) @variable.member)
(graph_node_binding
  "(?<" @punctuation.special
  name: (identifier) @variable.parameter
  ">" @punctuation.special)

(measure_clause "measure" @keyword)
(named_measure "as" @keyword)
(reduction_operator) @function.builtin
(tree_source "tree" @function.builtin)
(tree_items) @property
(tree_property) @property
(match_words "match" @keyword "words" @property)
(link_lengths "length" @property)
(capture_depth "depth" @property)
(relation_constraint "as" @keyword)

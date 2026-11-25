const RANGE_QUANTIFIER = /\{\d+(?:,\d*)?\}/;

// The unprefixed attribute keys, matching lingrep's `validate_canonical_key`.
const PORTABLE_ATTRIBUTE_KEYS = ['text', 'surface', 'lemma', 'norm', 'upos', 'xpos'];

// Words that begin a top-level `KEY: value` entry.
const ENTRY_KEYWORDS = ['key', 'skip', 'analyzer', 'vectors', 'labels'];

// Words that begin any other top-level item.
const BLOCK_KEYWORDS = [
  'defaults', 'bundle', 'use', 'override', 'interpret', 'classify', 'schema',
  'policy', 'set', 'test', 'group', 'lexicon', 'pattern', 'fragment',
];

const RELATION_LABEL = String.raw`[a-z][a-z0-9_]*(?::(?:[a-z0-9_]+|\*))?`;

export default grammar({
  name: 'lingrep',
  start: $ => $.source_file,

  extras: $ => [
    /[\s\f\uFEFF\u2060\u200B]/,
    $.comment,
  ],



  rules: {
    // Placement and uniqueness are enforced in the lowerer so a misplaced
    // block gets a diagnostic naming where it belongs instead of an ERROR node.
    source_file: $ => repeat(choice(
      $.defaults_block,
      $.bundle_block,
      $.bundle_use,
      $.override_entry,
      $.interpret_entry,
      $.classify_entry,
      $.schema_block,
      $.policy_block,
      $.key_entry,
      $.skip_entry,
      $.analyzer_entry,
      $.vectors_entry,
      $.labels_entry,
      $.metadata_entry,
      $.set_definition,
      $.test_definition,
      $.group_definition,
      $.lexicon_definition,
      $.pattern_definition
    )),

    _primary: $ => choice(
      $.node_pattern,
      // `measure` is reserved only where a clause can start, as `where` is:
      // `[] measure` is a syntax error, while `measure := measure.` and
      // `[text=measure]` stay legal.
      alias($.identifier, $.bare_element),
      $.pattern_reference,
      $.parenthesized_pattern,
      $.named_group,
      $.sentence_start,
      $.sentence_end,
      $.preceded_by,
      $.not_preceded_by,
      $.followed_by,
      $.not_followed_by,
      $.any_order,
      $.same_as
    ),

    parenthesized_pattern: $ => seq('(', $._pattern, ')'),

    // `repeat`, not `repeat1`: an empty `schema` block is meaningful — it
    // closes the catalog to compiler-owned keys alone — and an empty
    // `defaults` block is merely useless, not wrong.
    defaults_block: $ => seq(
      'defaults',
      repeat(choice($.key_entry, $.skip_entry, $.metadata_entry)),
      'end'
    ),

    bundle_block: $ => seq(
      'bundle', field('name', $.identifier),
      repeat($.metadata_entry),
      'end'
    ),

    bundle_use: $ => seq('use', '@', field('name', $.identifier)),

    override_entry: $ => seq('override', field('entry', $.metadata_entry)),

    interpret_entry: $ => seq(
      'interpret', field('capture', $.capture_reference),
      'as', field('role', $.identifier), field('labels', $.metadata_map)
    ),

    classify_entry: $ => seq('classify', 'by', field('role', $.identifier)),

    // Keywords are contextual: a word is reserved only where it begins a
    // construct. A definition name or metadata key may be any top-level
    // keyword, because the token after it (`:=` or `:`) decides the reading.
    // The entry keys of `KEY: value` entries are excluded from metadata keys,
    // where the two readings share that token.
    _definition_name: $ => keywordOrIdentifier($, [...ENTRY_KEYWORDS, ...BLOCK_KEYWORDS]),

    _metadata_key: $ => keywordOrIdentifier($, BLOCK_KEYWORDS),

    schema_block: $ => seq('schema', repeat($.schema_entry), 'end'),

    // Placement and uniqueness are enforced in the lowerer, for the reason
    // given at `source_file`.
    policy_block: $ => seq('policy', repeat($.policy_statement), 'end'),

    policy_statement: $ => seq(
      field('verb', $.policy_verb),
      field('subject', $.policy_subject),
      optional(commaSep1(field('argument', $.policy_argument))),
      '.'
    ),

    policy_verb: $ => choice('resolve', 'exclude', 'require', 'detach', 'admit'),

    // `all` is the only bare identifier legal here; a general identifier would
    // make a subject indistinguishable from an argument.
    policy_subject: $ => choice('all', 'patterns', $.pattern_reference, $.group_ref),

    policy_argument: $ => seq(
      field('key', $.identifier), ':', field('value', $._policy_value)
    ),

    // Structurally `_metadata_value` plus enums and references. It stays
    // separate because adding identifiers to `_metadata_value` would make bare
    // identifiers legal in metadata, where string values are always quoted.
    _policy_value: $ => choice(
      $.metadata_string, $.metadata_number, $.metadata_boolean,
      $.policy_enum, $.pattern_reference, $.group_ref,
      $.policy_list, $.policy_map
    ),

    policy_list: $ => seq('[', optional(commaSep1($._policy_value)), ']'),
    policy_map: $ => seq('{', optional(commaSep1($.policy_map_entry)), '}'),
    policy_map_entry: $ => seq(
      field('key', $.identifier), ':', field('value', $._policy_value)
    ),

    group_ref: $ => seq('%', field('name', $.identifier)),
    policy_enum: $ => $.identifier,

    schema_entry: $ => seq(
      optional(field('visibility', $.definition_kind)),
      field('key', $._metadata_key),
      ':',
      field('type', alias($.identifier, $.metadata_type)),
      optional(field('required', 'required')),
      optional(field('members', $.metadata_value_set))
    ),

    metadata_value_set: $ => seq('in', '{', commaSep1($.metadata_string), '}'),

    metadata_entry: $ => seq(
      field('key', $._metadata_key),
      ':',
      field('value', $._metadata_value)
    ),

    // Analyzer compatibility is compiler-owned structured metadata. Repeated
    // entries remain separate source nodes (alternatives downstream), while
    // required-field, duplicate-field, and cross-field checks stay in the
    // lowerer where they can produce precise diagnostics.
    analyzer_entry: $ => seq(
      'analyzer',
      ':',
      field('value', $.analyzer_map)
    ),

    // The word-vector table a catalog's `near` thresholds were chosen
    // against: a label and the BLAKE3 digest of the file. Repeated entries
    // are alternatives, as `analyzer` entries are; required and duplicate
    // fields are checked in the lowerer.
    vectors_entry: $ => seq(
      'vectors',
      ':',
      field('value', $.vectors_map)
    ),

    vectors_map: $ => seq(
      '{',
      commaSep1($._vectors_field),
      '}'
    ),

    _vectors_field: $ => choice(
      $.vectors_resource_field,
      $.vectors_digest_field
    ),

    vectors_resource_field: $ => keyed($, 'resource', field('value', $.analyzer_identifier)),

    vectors_digest_field: $ => keyed($, 'blake3', field('value', $.vectors_digest)),

    vectors_digest: $ => /"[0-9a-f]{64}"/,

    // Per attribute, a named label set such as "ud-v2", a list of named sets,
    // or an explicit value set.
    labels_entry: $ => seq(
      'labels',
      ':',
      field('value', $.labels_map)
    ),

    labels_map: $ => seq(
      '{',
      commaSep1($.labels_field),
      '}'
    ),

    labels_field: $ => seq(
      field('attribute', $.attribute_key),
      ':',
      field('value', choice($.metadata_string, $.labels_name_list, $.value_set))
    ),

    labels_name_list: $ => seq('[', commaSep1($.metadata_string), ']'),

    analyzer_map: $ => seq(
      '{',
      commaSep1($._analyzer_field),
      '}'
    ),

    _analyzer_field: $ => choice(
      $.analyzer_family_field,
      $.analyzer_resource_field,
      $.analyzer_split_field,
      $.analyzer_segmentation_field
    ),

    analyzer_family_field: $ => keyed($, 'family', field('value', $.analyzer_identifier)),

    analyzer_resource_field: $ => keyed($, 'resource', field('value', $.analyzer_identifier)),

    analyzer_split_field: $ => keyed($, 'split', field('value', $.sudachi_split)),

    analyzer_segmentation_field: $ => keyed($, 'segmentation',
      '[', commaSep1(field('value', $.segmentation_mode)), ']'
    ),

    analyzer_identifier: $ => /"[a-z][a-z0-9_-]*"/,

    sudachi_split: $ => choice('"A"', '"B"', '"C"'),

    segmentation_mode: $ => choice('"input"', '"analyzer"'),

    // `key` is compiler-owned syntax rather than an open metadata value. A
    // dedicated node preserves projection order and gives the lowerer named
    // fields instead of asking it to reinterpret a JSON-shaped map.
    key_entry: $ => keyed($, 'key', field('value', choice($.metadata_none, $.key_projection_list))),

    // `skip: @T` names the test whose tokens a pattern steps over. Like
    // `key`, it is compiler-owned syntax: its value is a test reference, which
    // an open metadata value cannot spell.
    skip_entry: $ => keyed($, 'skip', field('value', choice($.metadata_none, $.test_reference))),

    key_projection_list: $ => seq(
      '[',
      commaSep1(choice(
        $.lexical_segments_projection,
        $.lexical_term_projection,
        $.count_key_projection,
        $.match_key_projection,
        $.capture_key_projection,
        $.deep_key_projection
      )),
      ']'
    ),

    lexical_term_projection: $ => 'term',

    lexical_segments_projection: $ => seq(
      'segments',
      '(',
      field('attribute', $.attribute_key),
      ')'
    ),

    count_key_projection: $ => field('capture', $.capture_reference),

    match_key_projection: $ => field('attribute', $.attribute_key),

    deep_key_projection: $ => seq('deep', '(', field('relation', $.capture_key_projection), ')'),

    capture_key_projection: $ => seq(
      field('capture', $.capture_reference),
      '.',
      optional(seq(field('component', $.capture_component), '.')),
      field('attribute', choice(
        alias($._projection_attribute_key, $.attribute_key),
        $.edge_relation
      ))
    ),

    capture_component: $ => choice('first', 'last', 'span'),

    // The relation label of a named enhanced edge, `$e.rel`. The compiler
    // accepts it only when the `$` name resolves to such an edge.
    edge_relation: _ => 'rel',

    // There is no `null` production: a key that carries no information is
    // spelled by omitting the key. `metadata_none` is not that null; the
    // grammar admits it wherever a value sits and leaves its scope to the
    // lowerer.
    _metadata_value: $ => choice(
      $.metadata_string,
      $.metadata_number,
      $.metadata_boolean,
      $.metadata_none,
      $.metadata_list,
      $.metadata_map
    ),

    metadata_string: $ => /"([^"\\]|\\.)*"/,

    metadata_number: $ => /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,

    metadata_boolean: $ => choice('true', 'false'),

    // `none` is not null: it is legal only where the compiler can interpret
    // it as "unset the file default for this key", which the runtime
    // enforces. A key that never had a value is still spelled by omission.
    metadata_none: $ => 'none',

    metadata_list: $ => seq('[', optional(commaSep1($._metadata_value)), ']'),

    metadata_map: $ => seq('{', optional(commaSep1($.metadata_map_entry)), '}'),

    // Open metadata maps retain capture-reference keys for user-declared
    // schemas. Compiler-owned `key:` projections use `key_projection_list`
    // above and never pass through this generic representation.
    metadata_map_entry: $ => seq(
      field('key', choice($.identifier, $.capture_reference)),
      ':',
      field('value', $._metadata_value)
    ),

    definition_kind: $ => choice('pattern', 'fragment'),

    // The `where` clause attaches to the definition, after its expression and
    // before `.`, so relation constraints never enter the expression grammar
    // or its precedence chain. The grammar admits the clause on a `fragment`
    // definition; the lowerer refuses it there, because a sentence naming the
    // refusal beats an `ERROR` node — the same split every block placement
    // rule uses. `where` is reserved only where a clause can start (after an
    // expression), so `where := [].` stays a legal bare definition and
    // `[text=where]` a legal bracketed value, exactly like the four
    // lookaround names.
    pattern_definition: $ => choice(
      seq(field('kind', $.definition_kind), field('name', $.identifier), ...definitionBody($)),
      seq(field('name', $._definition_name), ...definitionBody($))
    ),

    lexicon_definition: $ => seq(
      'lexicon',
      field('name', $.identifier),
      'by',
      '[',
      commaSep1(field('attribute', $.attribute_key)),
      ']',
      ':=',
      '{',
      commaSep1(field('member', $.metadata_string)),
      '}',
      '.'
    ),

    // A set names literals, not an expression, so it is its own declaration
    // rather than a third `definition_kind`: `set X := <pattern>.` must not
    // parse, and `schema`'s visibility keywords stay `pattern` and `fragment`.
    //
    // Members reuse `value_set`, so a set's literals lower through exactly
    // the path an inline set's do — including the `　` escape decoding
    // `double-wo.lx` depends on.
    set_definition: $ => seq(
      'set',
      field('name', $.identifier),
      ':=',
      field('members', $.value_set),
      '.'
    ),

    // Spelled like `pattern_reference` but a distinct node: the operand of
    // `in`/`not in` inside `[…]` is a value set and can be nothing else, so
    // the position decides the kind. This also keeps `pattern_reference`
    // meaning "reference to a definition".
    set_reference: $ => seq('@', field('name', $.identifier)),

    // A test names a *predicate*, not an expression and not literals, so it is
    // its own declaration rather than a third `definition_kind` — the same
    // reason `set_definition` is its own. `test X := <pattern>.` must not
    // parse, and `schema`'s visibility keywords stay `pattern` and `fragment`.
    test_definition: $ => seq(
      'test',
      field('name', $.identifier),
      ':=',
      field('body', $._test),
      '.'
    ),

    // Spelled like `set_reference` and `pattern_reference`, and distinct for
    // the same reason: position decides the kind. Inside `[…]` a reference can
    // only be a test, so this is a distinction the parser makes rather than a
    // guess it encodes.
    test_reference: $ => seq('@', field('name', $.identifier)),

    // A group derives `%group` membership from a metadata predicate instead
    // of a per-definition `groups:` list. It names a selection over the
    // catalog, not an expression and not literals, so it is its own
    // declaration rather than a third `definition_kind` — the same reason
    // `set_definition` and `test_definition` are.
    group_definition: $ => seq(
      'group',
      field('name', $.identifier),
      ':=',
      field('body', $.group_predicate),
      '.'
    ),

    // The four forms mirror the attribute modes written inside `[…]`: `=`/`!=`
    // take one literal, `in`/`not in` take a braced set. Operands are
    // `metadata_string`s because metadata values are always quoted.
    group_predicate: $ => seq(
      field('key', $.identifier),
      choice(
        seq(
          field('operator', alias($._group_scalar_operator, $.group_operator)),
          field('value', $.metadata_string)
        ),
        seq(
          field('operator', alias($._group_set_operator, $.group_operator)),
          '{', commaSep1(field('value', $.metadata_string)), '}'
        )
      )
    ),

    _group_scalar_operator: $ => choice('=', '!='),

    _group_set_operator: $ => choice('in', seq('not', 'in')),

    _pattern: $ => choice($.alternation, $._intersection_or_below),

    alternation: $ => prec.left(1, seq(
      $._intersection_or_below,
      repeat1(seq('|', $._intersection_or_below))
    )),

    _intersection_or_below: $ => choice($.intersection, $._sequence_or_term),

    // `E1 & E2` matches where both operands match the same span. It binds
    // tighter than `|` and looser than sequence, so `a b & c d` intersects the
    // two sequences rather than sequencing `b & c`.
    //
    // The `&` here and the one in `attribute_conjunction` are different
    // operators that share a spelling, and nothing has to disambiguate them:
    // attribute conjunction is only reachable inside `[…]`, which has closed
    // by the time an expression-level `&` can appear.
    intersection: $ => prec.left(2, seq(
      $._sequence_or_term,
      repeat1(seq('&', $._sequence_or_term))
    )),

    _sequence_or_term: $ => choice($.pattern_sequence, $._term),

    pattern_sequence: $ => prec.left(3, seq(
      $._term,
      repeat1($._term)
    )),

    _term: $ => choice($.quantified_pattern, $._primary),

    quantified_pattern: $ => prec.right(4, seq(
      $._primary,
      $.quantifier
    )),

    // An empty bracket pair is the any-token predicate (`[]`); the runtime
    // compiles a zero-attribute predicate to `CompiledPredicate::Empty`.
    node_pattern: $ => seq('[', optional($._test), ']'),

    // `!` → `&` → `|`, mirroring the expression level's
    // quantification → sequence → `&` → `|`.
    _test: $ => choice($.test_disjunction, $._conjunction_or_below),

    test_disjunction: $ => prec.left(1, seq(
      $._conjunction_or_below,
      repeat1(seq('|', $._conjunction_or_below))
    )),

    _conjunction_or_below: $ => choice($.attribute_conjunction, $._test_primary),

    attribute_conjunction: $ => prec.left(2, seq(
      $._test_primary,
      repeat1(seq('&', $._test_primary))
    )),

    _test_primary: $ => choice(
      $.attribute,
      $.test_reference,
      $.test_negation,
      $.parenthesized_test
    ),

    // The operand is parenthesized or a reference, never a bare attribute.
    // Two reasons, both deliberate. `!` is then only ever followed by `(` or
    // `@`, so it can never contend with the `!=` and `!~` operator tokens.
    // And `[!pos1=動詞]` would otherwise sit one character from
    // `[pos1!=動詞]` while meaning something different — a true complement
    // holds for a token with no `pos1`, and `!=` does not. Making the
    // divergence require a visible bracket is what keeps it readable.
    test_negation: $ => seq('!', choice($.parenthesized_test, $.test_reference)),

    parenthesized_test: $ => seq('(', $._test, ')'),

    attribute: $ => {
      const form = (operator, ...operand) => seq(
        field('attribute', $.attribute_key),
        field('operator', alias(operator, $.attribute_operator)),
        ...operand
      );
      return choice(
        form($._scalar_attribute_operator, field('value', $.value)),
        form($._set_attribute_operator, setOperand($)),
        form(
          $._near_attribute_operator,
          field('value', $.value), '>=', field('threshold', $.similarity_threshold)
        ),
        form($._has_operator, field('value', $.value)),
        form($._has_any_operator, setOperand($))
      );
    },

    // `=`/`!=` are exact (literal operands only, enforced downstream);
    // `~`/`!~` are search (literal substring containment, or regex search).
    _scalar_attribute_operator: $ => choice('=', '!=', '~', '!~'),

    _set_attribute_operator: $ => choice('in', seq('not', 'in')),

    // `near` holds for the values whose word vector has a cosine similarity
    // to the operand's of at least the threshold. White space must separate
    // the operand from `>=`, because `>` and `=` are legal value characters.
    _near_attribute_operator: $ => choice('near', seq('not', 'near')),

    // Its own token because `value` excludes `.`. The lowerer checks the
    // range, so an out-of-range threshold gets a diagnostic that says so.
    similarity_threshold: $ => /\d+(\.\d+)?/,

    _has_operator: $ => choice('has', seq('not', 'has')),

    _has_any_operator: $ => choice(seq('has', 'any'), seq('not', 'has', 'any')),

    value_set: $ => seq('{', commaSep1($.value), '}'),

    // One token, so no white space or comment can sit inside a key. Three
    // disjoint namespaces: the six portable keys, `feat.Name` or
    // `feat.Name[layer]`, and provider paths of two or more lowercase segments
    // whose first segment is neither a portable key nor `feat`. A provider
    // path cannot end in `.`, so the `.` that ends a definition directly after
    // a key, as in `$a.lemma = $b.unidic.pos1.`, lexes as the terminator.
    attribute_key: _ => attributeKeyToken([]),

    // In a capture projection, `$c.first.norm` reads `first` as the capture
    // component, so a provider path there cannot start with a component name.
    _projection_attribute_key: _ => attributeKeyToken(['first', 'last', 'span']),

    // No `$.identifier` branch: the catch-all below matches a superset of
    // identifier characters, so an identifier token never wins here —
    // `[text=foo]` parses as `(value)` with an anonymous token. Add the
    // branch only together with a narrower catch-all.
    value: $ => choice(
      $.regex,
      // Allow non-special characters; sets reserve comma/braces. `)` and `.`
      // are excluded because an attribute can sit directly inside
      // `parenthesized_test` or a bare `test_definition` body, immediately
      // followed by the token that closes it.
      /[^\]()\s&;,.{}]+/
    ),

    regex: $ => {
      const escapeChar = '\\';
      // Precedence over `value`'s catch-all token: otherwise a tight regex
      // like `/x/` loses to the catch-all (same length) and parses as an
      // anonymous value token, while `/a b/` wins only because the space
      // stops the catch-all. That made regex nodes content-dependent.
      return token(prec(1, seq(
        '/',
        repeat(choice(
          seq(escapeChar, /./),  // escaped character
          /[^\/\\]/              // anything but a slash or backslash
        )),
        '/'
      )));
    },


    named_group: $ => seq(
      '(?<',
      field('name', $.identifier),
      '>',
      field('pattern', $._pattern),
      ')'
    ),

    pattern_reference: $ => seq('@', field('name', $.identifier)),

    sentence_start: $ => '^',

    sentence_end: $ => '$',

    preceded_by: $ => lookaround($, 'preceded_by'),

    not_preceded_by: $ => lookaround($, 'not_preceded_by'),

    followed_by: $ => lookaround($, 'followed_by'),

    not_followed_by: $ => lookaround($, 'not_followed_by'),

    // With `within=document` or `within=<division kind>`, the body may match
    // tokens of the neighbouring sentences in that unit.
    _lookaround_scope: $ => seq(',', 'within', '=', field('scope', $.identifier)),

    // Bind named one-token nodes without imposing their sentence order. The
    // compiler owns the operand-count and node-shape diagnostics, so a
    // singleton and an arbitrary expression both remain recoverable CSTs.
    any_order: $ => seq(
      'any_order',
      '(',
      commaSep1(field('operand', $._pattern)),
      ')'
    ),

    same_as: $ => seq(
      'same_as',
      '(',
      field('capture', $.capture_reference),
      optional(seq(',', 'by', '=', field('attribute', $.attribute_key))),
      ')'
    ),

    capture_reference: $ => seq('$', field('name', $.identifier)),

    quantifier: $ => choice(
      '+',
      '*',
      '?',
      RANGE_QUANTIFIER
    ),

    measure_clause: $ => seq('measure', commaSep1($.named_measure)),
    named_measure: $ => seq(
      field('value', choice($.reduction, $.capture_depth)), 'as',
      field('name', $.capture_reference)
    ),
    reduction: $ => seq(
      field('operator', $.reduction_operator), '(',
      field('collection', choice($.tree_collection, $.match_words, $.link_selection, $.link_lengths)), ')'
    ),
    reduction_operator: _ => choice('count', 'mean', 'max'),
    tree_items: _ => choice('links', 'nodes', 'boundaries'),
    tree_property: _ => choice('length', 'depth', 'open_links'),
    tree_source: $ => seq('tree', '(', field('layer', choice($.span_layer_name, $.metadata_string)), ')'),
    tree_collection: $ => seq($.tree_source, '.', field('items', $.tree_items),
      optional(seq('.', field('property', $.tree_property)))),
    capture_depth: $ => seq($.tree_source, '.', 'depth', '(', field('capture', $.capture_reference), ')'),
    match_words: $ => seq('match', '.', 'words', field('test', $.node_pattern)),
    link_selection: $ => seq(field('head', $.capture_reference), '-[',
      field('label', $.label_set), ']->', field('test', $.node_pattern)),
    link_lengths: $ => seq('(', $.link_selection, ')', '.', 'length'),

    where_clause: $ => seq(
      'where',
      commaSep1(field('constraint', choice($.relation_constraint, $.order_constraint, $.attribute_comparison, $.span_constraint)))
    ),

    attribute_comparison: $ => seq(
      field('left', $.capture_attribute),
      field('operator', alias($._comparison_operator, $.attribute_operator)),
      field('right', $.capture_attribute)
    ),

    _comparison_operator: _ => choice('=', '!='),

    capture_attribute: $ => seq(
      field('capture', $.capture_reference), '.', field('attribute', $.attribute_key)
    ),

    dependent_count: _ => RANGE_QUANTIFIER,

    span_constraint: $ => seq(
      'span', '(', field('layer', choice($.span_layer_name, $.metadata_string)), ',',
      field('operand', $.span_operand), repeat(seq('->', field('operand', $.span_operand))), ')'
    ),

    span_layer_name: $ => seq($.identifier, repeat(seq('.', $.identifier))),

    span_operand: $ => seq(
      field('capture', $.capture_reference),
      optional(seq('.', field('position', $.identifier))),
      optional(seq('@', field('label', choice($.identifier, $.metadata_string))))
    ),

    // `$a < $b < $c` requires each named node to precede the next in
    // sentence order.
    order_constraint: $ => seq(
      field('operand', $.capture_reference),
      repeat1(seq('<', field('operand', $.capture_reference)))
    ),

    // `$head -[labels]-> $dependent` points head \u2192 dependent, as UD draws a
    // basic edge. A dependent capture binds identity; a node pattern tests an
    // edge-compatible dependent without binding it; `_` asks only whether one
    // exists. `not` is the complement under a complete observation of the
    // relevant edge set. A positive basic edge may instead bind one endpoint
    // as a graph node. Enhanced negation accepts capture references or a
    // derived `basic_head($capture)` at either endpoint and no edge binder;
    // graph-node binders, anonymous and predicate targets, and named edges are
    // positive-only. A derived basic head is valid only as an enhanced endpoint;
    // it is not a pattern primary or a basic-relation operand.
    relation_constraint: $ => choice(
      seq(
        optional(field('polarity', $.relation_negation)),
        field('head', choice($.capture_reference, $.graph_node_binding)),
        '-[', field('path', '+'), field('label', $.label_set),
        optional(seq(field('boundary', choice('first', 'last')), field('boundary_label', $.label_set))),
        ']->', field('dependent', choice($.capture_reference, $.graph_node_binding))
      ),
      seq(
        optional(field('polarity', $.relation_negation)),
        field('head', $.capture_reference),
        '-[',
        field('label', $.label_set),
        ']->',
        field('dependent', $.capture_reference)
      ),
      seq(
        optional(field('polarity', $.relation_negation)),
        field('head', $.capture_reference),
        '-[',
        field('label', $.label_set),
        ']->',
        field('dependent', $.anonymous_dependency_node)
      ),
      seq(
        optional(field('polarity', $.relation_negation)),
        field('head', $.capture_reference),
        '-[',
        field('label', $.label_set),
        ']->',
        field('dependent', $.node_pattern),
        optional(field('count', $.dependent_count)),
        optional(seq('as', field('count_binding', $.capture_reference)))
      ),
      seq(
        field('head', $.graph_node_binding),
        '-[',
        field('label', $.label_set),
        ']->',
        field('dependent', $.capture_reference)
      ),
      seq(
        field('head', $.capture_reference),
        '-[',
        field('label', $.label_set),
        ']->',
        field('dependent', $.graph_node_binding)
      ),
      seq(
        field('polarity', $.relation_negation),
        field('head', choice($.capture_reference, $.basic_head_endpoint)),
        '-[',
        field('kind', $.relation_kind),
        field('label', $.label_set),
        ']->',
        field('dependent', choice($.capture_reference, $.basic_head_endpoint))
      ),
      seq(
        field('head', choice(
          $.capture_reference,
          $.graph_node_binding,
          $.basic_head_endpoint
        )),
        '-[',
        field('kind', $.relation_kind),
        field('label', $.label_set),
        optional(seq('as', field('edge', $.capture_reference))),
        ']->',
        field('dependent', choice(
          $.capture_reference,
          $.graph_node_binding,
          $.basic_head_endpoint
        ))
      )
    ),

    relation_negation: $ => 'not',

    relation_kind: $ => 'enhanced',

    // The basic head of one captured surface token, derived only where an
    // enhanced relation expects an endpoint. The compiler owns capture
    // resolution, exact-width validation, and the non-root/usable-HEAD rule.
    basic_head_endpoint: $ => seq(
      'basic_head',
      '(',
      field('dependent', $.capture_reference),
      ')'
    ),

    anonymous_dependency_node: $ => '_',

    // A named graph node. The named-group visual form is reused only in a
    // relation endpoint; restricting the body to one `node_pattern` keeps a
    // graph node free of a surface span or sequence width.
    graph_node_binding: $ => seq(
      '(?<',
      field('name', $.identifier),
      '>',
      field('predicate', $.node_pattern),
      ')'
    ),

    // Either `*`, meaning any present basic dependency relation, or one or
    // more label terms joined by `|`. A dependent carries exactly one
    // `dep.rel`, so the disjunction has at most one true term and the matched
    // label stays observable as that capture's `dep.rel` \u2014 no new record
    // shape is needed to report which term matched. The two forms are
    // separate so redundant `*|obj` cannot enter the typed language.
    //
    // `|` needs no spacing discipline here, unlike an unquoted attribute
    // value: `relation_label` cannot contain `|`, and the bracket admits no
    // other reading of it, so the `PipeInBareValue` trap is unreachable.
    label_set: $ => choice(
      $.any_relation,
      seq(
        field('term', $._label_term),
        repeat(seq('|', field('term', $._label_term)))
      )
    ),

    any_relation: $ => '*',

    // A term is a literal label or a `@name` reference to a `set` declaration,
    // resolved against the accumulated catalog where `[x in @S]` resolves.
    _label_term: $ => choice($.relation_label, $.deep_relation_label, $.set_reference),

    // A basic UD relation label: lowercase, with at most one `:` subtype,
    // matching what the CoNLL-U reader publishes as `dep.rel` (DEPREL
    // lowercased whole, subtype included \u2014 `nsubj`, `obl:tmod`).
    //
    // The subtype position also admits `*`, matching any subtype of the
    // prefix. `obl:*` matches `obl:tmod` but not bare `obl`:
    // those are different labels, and a wildcard that also matched the
    // unsubtyped form would make `obl|obl:*` mean `obl:*`. Write
    // `-[obl|obl:*]->` for "obl, subtyped or not". A bare `*` is the distinct
    // `any_relation` form above rather than a relation label.
    relation_label: $ => new RegExp(RELATION_LABEL),

    deep_relation_label: $ => new RegExp(`(?:${RELATION_LABEL}|\\*)@!?[a-z][a-z0-9_]*`),

    identifier: $ => /[a-zA-Z_\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF][\w\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]*/,
    
    comment: $ => /#.*/
  }
});

// A regex source for `[a-z][a-z0-9]*` minus the listed words, built from
// their trie: at each prefix, either end (unless the prefix is a listed word),
// continue with a character that leaves the trie, or descend into it.
function lowercaseNameExcept(words) {
  const trie = new Map();
  for (const word of words) {
    let node = trie;
    for (const character of word) {
      if (!node.has(character)) node.set(character, new Map());
      node = node.get(character);
    }
    node.set('', null);
  }
  const range = (first, last) => Array.from(
    { length: last.charCodeAt(0) - first.charCodeAt(0) + 1 },
    (_, offset) => String.fromCharCode(first.charCodeAt(0) + offset)
  );
  const lower = range('a', 'z');
  const tail = [...lower, ...range('0', '9')];
  const walk = (node, alphabet, isRoot) => {
    const children = [...node.keys()].filter((key) => key !== '');
    const leaving = alphabet.filter((character) => !children.includes(character));
    const branches = [
      ...(leaving.length ? [`[${leaving.join('')}][a-z0-9]*`] : []),
      ...children.map((character) => character + walk(node.get(character), tail, false)),
    ];
    const group = `(?:${branches.join('|')})`;
    return isRoot || node.has('') ? group : `${group}?`;
  };
  return walk(trie, lower, true);
}

function attributeKeyToken(extraExcludedNamespaces) {
  const namespace = lowercaseNameExcept(
    [...PORTABLE_ATTRIBUTE_KEYS, 'feat', ...extraExcludedNamespaces]
  );
  return token(choice(
    ...PORTABLE_ATTRIBUTE_KEYS,
    /feat\.[A-Z][A-Za-z0-9]*(\[[a-z][a-z0-9]*\])?/,
    new RegExp(`${namespace}(\\.[a-z][a-z0-9]*)+`)
  ));
}

function keywordOrIdentifier($, keywords) {
  return choice($.identifier, ...keywords.map((word) => alias(word, $.identifier)));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

function keyed($, key, ...value) {
  return seq(field('key', alias(key, $.identifier)), ':', ...value);
}

function setOperand($) {
  return choice(field('values', $.value_set), field('set', $.set_reference));
}

function lookaround($, keyword) {
  return seq(keyword, '(', field('body', $._pattern), optional($._lookaround_scope), ')');
}

function definitionBody($) {
  return [
    ':=',
    field('pattern', $._pattern),
    optional(field('where', $.where_clause)),
    optional(field('measure', $.measure_clause)),
    '.',
  ];
}

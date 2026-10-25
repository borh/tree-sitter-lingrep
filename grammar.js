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
      $.schema_block,
      $.policy_block,
      $.key_entry,
      $.analyzer_entry,
      $.metadata_entry,
      $.set_definition,
      $.test_definition,
      $.group_definition,
      $.lexicon_definition,
      $.pattern_definition
    )),

    _primary: $ => choice(
      $.node_pattern,
      $.bare_element,
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
      repeat(choice($.key_entry, $.metadata_entry)),
      'end'
    ),

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

    group_ref: $ => seq('%', $.identifier),
    policy_enum: $ => $.identifier,

    schema_entry: $ => seq(
      optional(field('visibility', $.definition_kind)),
      field('key', $.identifier),
      ':',
      field('type', $.metadata_type),
      optional(field('required', 'required')),
      optional(field('members', $.metadata_value_set))
    ),

    metadata_type: $ => choice('string', 'number', 'boolean', 'list'),

    metadata_value_set: $ => seq('in', '{', commaSep1($.metadata_string), '}'),

    metadata_entry: $ => seq(
      field('key', $.identifier),
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

    analyzer_map: $ => seq(
      '{',
      commaSep1($.analyzer_field),
      '}'
    ),

    analyzer_field: $ => choice(
      $.analyzer_family_field,
      $.analyzer_resource_field,
      $.analyzer_split_field,
      $.analyzer_segmentation_field
    ),

    analyzer_family_field: $ => seq(
      field('key', alias('family', $.identifier)),
      ':',
      field('value', $.analyzer_identifier)
    ),

    analyzer_resource_field: $ => seq(
      field('key', alias('resource', $.identifier)),
      ':',
      field('value', $.analyzer_identifier)
    ),

    analyzer_split_field: $ => seq(
      field('key', alias('split', $.identifier)),
      ':',
      field('value', $.sudachi_split)
    ),

    analyzer_segmentation_field: $ => seq(
      field('key', alias('segmentation', $.identifier)),
      ':',
      '[',
      commaSep1(field('value', $.segmentation_mode)),
      ']'
    ),

    analyzer_identifier: $ => /"[a-z][a-z0-9_-]*"/,

    sudachi_split: $ => choice('"A"', '"B"', '"C"'),

    segmentation_mode: $ => choice('"input"', '"analyzer"'),

    // `key` is compiler-owned syntax rather than an open metadata value. A
    // dedicated node preserves projection order and gives the lowerer named
    // fields instead of asking it to reinterpret a JSON-shaped map.
    key_entry: $ => seq(
      field('key', alias('key', $.identifier)),
      ':',
      field('value', choice($.metadata_none, $.key_projection_list))
    ),

    key_projection_list: $ => seq(
      '[',
      commaSep1(choice(
        $.lexical_segments_projection,
        $.lexical_term_projection,
        $.match_key_projection,
        $.capture_key_projection
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

    match_key_projection: $ => field('attribute', $.attribute_key),

    capture_key_projection: $ => seq(
      field('capture', $.capture_reference),
      '.',
      optional(seq(field('component', $.capture_component), '.')),
      // `rel` is contextual: the compiler accepts this identifier projection
      // only when the `$` name resolves to a named enhanced edge. Admit that
      // one literal rather than opening this position to arbitrary identifiers,
      // so misspelled ordinary attributes remain syntax errors.
      field('attribute', choice(
        $.attribute_key,
        alias('rel', $.identifier)
      ))
    ),

    capture_component: $ => choice('first', 'last', 'span'),

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
      seq(
        field('kind', $.definition_kind),
        field('name', $.identifier),
        ':=',
        field('pattern', $._pattern),
        optional(field('where', $.where_clause)),
        '.'
      ),
      seq(
        field('name', $.identifier),
        ':=',
        field('pattern', $._pattern),
        optional(field('where', $.where_clause)),
        '.'
      )
    ),

    lexicon_definition: $ => seq(
      'lexicon',
      field('name', $.identifier),
      'by',
      '[',
      commaSep1(field('projection', $.attribute_key)),
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
    set_reference: $ => seq('@', $.identifier),

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
    test_reference: $ => seq('@', $.identifier),

    // A group derives `%group` membership from a metadata predicate instead
    // of a per-definition `groups:` list. It names a selection over the
    // catalog, not an expression and not literals, so it is its own
    // declaration rather than a third `definition_kind` — the same reason
    // `set_definition` and `test_definition` are, and the keyword reserves
    // the bare name the same lexical way: `group := …` fails while
    // `pattern group := …` stays legal.
    group_definition: $ => seq(
      'group',
      field('name', $.identifier),
      ':=',
      field('body', $.group_predicate),
      '.'
    ),

    // The four forms mirror the attribute modes written inside `[…]`: `=`/`!=`
    // take one literal, `in`/`not in` take a braced set. Operands are
    // `metadata_string`s because metadata values are always quoted. The
    // operator is a named node so the lowerer can classify the form from one
    // node's text instead of scanning anonymous children.
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

    _pattern: $ => choice(
      $.alternation,
      $.intersection,
      $.pattern_sequence,
      $.quantified_pattern,
      $._primary
    ),

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

    attribute: $ => choice(
      seq(
        field('key', $.key),
        field('operator', alias($._scalar_attribute_operator, $.attribute_operator)),
        field('value', $.value)
      ),
      seq(
        field('key', $.key),
        field('operator', alias($._set_attribute_operator, $.attribute_operator)),
        choice(
          field('values', $.value_set),
          field('set', $.set_reference)
        )
      ),
      seq(
        field('key', $.key),
        field('operator', $.set_has_operator),
        field('value', $.value)
      ),
      seq(
        field('key', $.key),
        field('operator', $.set_has_any_operator),
        choice(
          field('values', $.value_set),
          field('set', $.set_reference)
        )
      ),
      seq(
        field('key', $.key),
        field('operator', $.set_not_has_operator),
        field('value', $.value)
      ),
      seq(
        field('key', $.key),
        field('operator', $.set_not_has_any_operator),
        choice(
          field('values', $.value_set),
          field('set', $.set_reference)
        )
      )
    ),

    // `=`/`!=` are exact (literal operands only, enforced downstream);
    // `~`/`!~` are search (literal substring containment, or regex search).
    _scalar_attribute_operator: $ => choice('=', '!=', '~', '!~'),

    _set_attribute_operator: $ => choice('in', seq('not', 'in')),

    set_has_operator: $ => 'has',

    set_has_any_operator: $ => seq('has', 'any'),

    set_not_has_operator: $ => seq('not', 'has'),

    set_not_has_any_operator: $ => seq('not', 'has', 'any'),

    value_set: $ => seq('{', commaSep1($.value), '}'),

    // Flat, left-associative list of test primaries joined by `&`. The shape
    // must stay flat: lingrep-core collects direct children, so nesting
    // `a & b & c` would drop constraints 2..N.

    key: $ => $.attribute_key,

    // Canonical V8 attributes have three disjoint namespaces. Keeping these
    // as structured nodes lets the lowerer validate and intern without
    // reparsing an unrestricted identifier string.
    attribute_key: $ => choice(
      $.portable_attribute_key,
      $.feature_attribute_key,
      $.provider_attribute_key
    ),

    portable_attribute_key: $ => choice('text', 'lemma', 'norm', 'upos', 'xpos'),

    feature_attribute_key: $ => seq(
      'feat',
      '.',
      field('name', $.ud_feature_name)
    ),

    ud_feature_name: $ => seq(
      field('base', $.ud_feature_base),
      optional(seq('[', field('layer', $.ud_feature_layer), ']'))
    ),

    ud_feature_base: $ => /[A-Z][A-Za-z0-9]*/,

    ud_feature_layer: $ => /[a-z][a-z0-9]*/,

    provider_attribute_key: $ => seq(
      field('segment', $.provider_segment),
      repeat1(seq('.', field('segment', $.provider_segment)))
    ),

    provider_segment: $ => /[a-z][a-z0-9]*/,

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

    bare_element: $ => $.identifier,

    named_group: $ => seq(
      '(?<',
      field('name', $.identifier),
      '>',
      field('pattern', $._pattern),
      ')'
    ),

    pattern_reference: $ => seq(
      '@',
      $.identifier
    ),

    sentence_start: $ => '^',

    sentence_end: $ => '$',

    preceded_by: $ => seq(
      'preceded_by',
      '(',
      field('body', $._pattern),
      ')'
    ),

    not_preceded_by: $ => seq(
      'not_preceded_by',
      '(',
      field('body', $._pattern),
      ')'
    ),

    followed_by: $ => seq(
      'followed_by',
      '(',
      field('body', $._pattern),
      ')'
    ),

    not_followed_by: $ => seq(
      'not_followed_by',
      '(',
      field('body', $._pattern),
      ')'
    ),

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
      optional(seq(',', 'by', '=', field('projection', $.capture_projection))),
      ')'
    ),

    capture_reference: $ => seq('$', field('name', $.identifier)),

    capture_projection: $ => $.attribute_key,

    quantifier: $ => choice(
      '+',
      '*',
      '?',
      /\{\d+(?:,\d*)?\}/
    ),

    where_clause: $ => seq(
      'where',
      commaSep1(field('constraint', $.relation_constraint))
    ),

    // `$head -[labels]-> $dependent` points head \u2192 dependent, as UD draws a
    // basic edge. A dependent capture binds identity; a node pattern tests an
    // edge-compatible dependent without binding it; `_` asks only whether one
    // exists. `not` is the complement under a complete observation of the
    // relevant edge set. Enhanced negation accepts capture references or a
    // derived `basic_head($capture)` at either endpoint and no edge binder;
    // graph-node binders, anonymous and predicate targets, and named edges are
    // positive-only. A derived basic head is valid only as an enhanced endpoint;
    // it is not a pattern primary or a basic-relation operand.
    relation_constraint: $ => choice(
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
        field('dependent', $.node_pattern)
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

    // A named enhanced-graph node. The named-group visual form is reused only
    // in an enhanced relation endpoint; restricting the body to one
    // `node_pattern` prevents it from pretending that a graph node has a
    // surface span or sequence width.
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
    _label_term: $ => choice($.relation_label, $.set_reference),

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
    relation_label: $ => /[a-z][a-z0-9_]*(?::(?:[a-z0-9_]+|\*))?/,

    identifier: $ => /[a-zA-Z_\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF][\w\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]*/,
    
    comment: $ => /#.*/
  }
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

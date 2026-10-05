# Bible Oracle for SillyTavern 1.19.0

A prototype extension for retrieving verified KJV passages for roleplay.

## Installation

Install this ZIP through SillyTavern's **Extensions -> Install Extension -> Install from ZIP**.
After installation, restart/reload SillyTavern and open the **Extensions** panel. A **Bible Oracle** drawer with an **Open Bible Oracle** button should appear.

This build intentionally appends its settings UI directly to `#extensions_settings2` rather than relying on a template path, avoiding the path mismatch in the previous prototype.

## Safety against hallucinated Scripture

Bible text is loaded from a public-domain KJV JSON corpus. The model is only asked to rank retrieved candidate passages. It is never trusted to generate the displayed Scripture text.


## Semantic search

Catalogue search now has two modes. Word Search performs exact/local lexical retrieval. Semantic Search uses the active SillyTavern model to expand the request into concepts and then rerank retrieved passages by meaning, while all displayed Scripture still comes verbatim from the verified local KJV corpus.

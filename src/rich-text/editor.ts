import { history } from "prosemirror-history";
import { MarkdownSerializer } from "prosemirror-markdown";
import { Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Transform } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import {
    collapseExternalPlugins,
    combineSchemas,
    ExternalEditorPlugin,
} from "../shared/external-editor-plugin";
import { CodeBlockHighlightPlugin } from "../shared/highlighting/highlight-plugin";
import { error, log } from "../shared/logger";
import { buildMarkdownParser } from "../shared/markdown-parser";
import {
    defaultImageUploadHandler,
    richTextImageUpload,
} from "../shared/prosemirror-plugins/image-upload";
import {
    editableCheck,
    readonlyPlugin,
} from "../shared/prosemirror-plugins/readonly";
import { CodeStringParser } from "../shared/schema";
import { deepMerge } from "../shared/utils";
import {
    BaseView,
    CommonViewOptions,
    defaultParserFeatures,
} from "../shared/view";
import { createMenu } from "./commands";
import { richTextInputRules } from "./inputrules";
import { allKeymaps } from "./key-bindings";
import { stackOverflowMarkdownSerializer } from "./markdown-serializer";
import { CodeBlockView } from "./node-views/code-block";
import { HtmlBlock, HtmlBlockContainer } from "./node-views/html-block";
import { ImageView } from "./node-views/image";
import { TagLink } from "./node-views/tag-link";
import { codePasteHandler } from "./plugins/code-paste-handler";
import { linkPasteHandler } from "./plugins/link-paste-handler";
import { linkPreviewPlugin, LinkPreviewProvider } from "./plugins/link-preview";
import { linkTooltipPlugin } from "./plugins/link-editor";
import { plainTextPasteHandler } from "./plugins/plain-text-paste-handler";
import { spoilerToggle } from "./plugins/spoiler-toggle";
import { tables } from "./plugins/tables";
import { richTextSchema } from "./schema";
import { interfaceManagerPlugin } from "../shared/prosemirror-plugins/interface-manager";

export interface RichTextOptions extends CommonViewOptions {
    /** Array of LinkPreviewProviders to handle specific link preview urls */
    linkPreviewProviders?: LinkPreviewProvider[];
    codeblockOverrideLanguage?: string;
}

/*
 * Implements an WYSIWYG-style editor. Content will be rendered immediately by prosemirror but the in- and output will still be markdown
 */
export class RichTextEditor extends BaseView {
    private options: RichTextOptions;
    private markdownSerializer: MarkdownSerializer;
    private externalPlugins: ExternalEditorPlugin;

    constructor(target: Node, content: string, options: RichTextOptions = {}) {
        super();
        this.options = deepMerge(RichTextEditor.defaultOptions, options);

        this.externalPlugins = collapseExternalPlugins(
            this.options.externalPlugins
        );

        this.markdownSerializer = stackOverflowMarkdownSerializer(
            this.externalPlugins
        );

        const doc = this.parseContent(content);

        const tagLinkOptions = this.options.parserFeatures.tagLinks;
        this.editorView = new EditorView(
            (node: HTMLElement) => {
                node.classList.add(...this.options.classList);
                target.appendChild(node);
            },
            {
                editable: editableCheck,
                state: EditorState.create({
                    doc: doc,
                    plugins: [
                        history(),
                        ...allKeymaps(this.options.parserFeatures),
                        createMenu(this.options),
                        richTextInputRules(this.options.parserFeatures),
                        linkPreviewPlugin(this.options.linkPreviewProviders),
                        CodeBlockHighlightPlugin(
                            this.options.codeblockOverrideLanguage
                        ),
                        interfaceManagerPlugin(
                            this.options.pluginParentContainer
                        ),
                        linkTooltipPlugin(this.options.parserFeatures),
                        richTextImageUpload(
                            this.options.imageUpload,
                            this.options.parserFeatures.validateLink
                        ),
                        readonlyPlugin(),
                        spoilerToggle,
                        tables,
                        codePasteHandler,
                        linkPasteHandler(this.options.parserFeatures),
                        ...this.externalPlugins.plugins,
                        // IMPORTANT: the plainTextPasteHandler must be added after *all* other paste handlers
                        plainTextPasteHandler,
                    ],
                }),
                nodeViews: {
                    code_block(node: ProseMirrorNode) {
                        return new CodeBlockView(node);
                    },
                    image(
                        node: ProseMirrorNode,
                        view: EditorView,
                        getPos: () => number
                    ) {
                        return new ImageView(node, view, getPos);
                    },
                    tagLink(node: ProseMirrorNode) {
                        return new TagLink(node, tagLinkOptions);
                    },
                    html_block: function (node: ProseMirrorNode) {
                        return new HtmlBlock(node);
                    },
                    html_block_container: function (node: ProseMirrorNode) {
                        return new HtmlBlockContainer(node);
                    },
                    ...this.externalPlugins.nodeViews,
                },
                plugins: [],
            }
        );

        log(
            "prosemirror rich-text document",
            this.editorView.state.doc.toJSON().content
        );
    }

    static get defaultOptions(): RichTextOptions {
        return {
            parserFeatures: defaultParserFeatures,
            editorHelpLink: null,
            linkPreviewProviders: [],
            codeblockOverrideLanguage: null,
            menuParentContainer: null,
            imageUpload: {
                handler: defaultImageUploadHandler,
            },
            externalPlugins: [],
        };
    }

    parseContent(content: string): ProseMirrorNode {
        const alteredSchema = combineSchemas(
            richTextSchema,
            this.externalPlugins?.schema
        );

        const markdownParser = buildMarkdownParser(
            this.options.parserFeatures,
            alteredSchema,
            this.externalPlugins
        );

        let doc: ProseMirrorNode;

        try {
            doc = markdownParser.parse(content);
        } catch (e) {
            // there was a catastrophic error! Try not to lose the user's doc...
            error(
                "RichTextEditorConstructor markdownParser.parse",
                "Catastrophic parse error!",
                e
            );

            doc = CodeStringParser.fromSchema(alteredSchema).parseCode(content);

            // manually add an h1 warning to the newly parsed doc
            const tr = new Transform(doc).insert(
                0,
                alteredSchema.node(
                    "heading",
                    { level: 1 },
                    alteredSchema.text(
                        "WARNING! There was an error parsing the document"
                    )
                )
            );

            doc = tr.doc;
        }

        return doc;
    }

    serializeContent(): string {
        return this.markdownSerializer.serialize(this.editorView.state.doc);
    }
}

// GENERATED — DO NOT EDIT BY HAND.
// Regenerate: pnpm --filter @zero/server gen:trpc-boundary
// Source of truth: apps/server/src/trpc/router.ts (emitted via tsconfig.boundary.json).
//
// apps/mail's type boundary for AppRouter (issue devlab-io/zero#43): a self-contained
// declaration carrying every procedure's exact input/output types, with the client-unused
// server context env neutralised so apps/mail's tsc no longer compiles the server graph.
// A CI check re-runs the generator and fails on drift. See docs/adr/0006-trpc-type-boundary.md.
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
export declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: {
        c: import("hono").Context<{
            Bindings: Record<string, unknown>;
            Variables: {
                auth: {
                    api: {
                        listUserAccounts: (input: {
                            headers: Headers;
                        }) => Promise<{
                            accountId: string;
                            providerId: string;
                            scopes?: readonly string[] | null;
                        }[]>;
                        getAccessToken: (input: {
                            body: {
                                providerId: string;
                                accountId?: string;
                            };
                            headers: Headers;
                        }) => Promise<{
                            accessToken?: string | null;
                            scopes?: readonly string[] | null;
                        }>;
                        signOut: (input: {
                            headers: Headers;
                        }) => Promise<unknown>;
                        deleteUser: (input: {
                            body: {
                                callbackURL: string;
                            };
                            headers: Headers;
                            request: Request;
                        }) => Promise<{
                            success: boolean;
                            message: string;
                        }>;
                    };
                };
                sessionUser?: {
                    id: string;
                    name: string;
                    email: string;
                };
                traceId?: string;
                requestId?: string;
            };
        }>;
        sessionUser?: {
            id: string;
            name: string;
            email: string;
        };
    };
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: true;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    ai: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        generateSearchQuery: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                query: string;
            };
            output: {
                query: string;
            };
            meta: object;
        }>;
        compose: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                prompt: string;
                to?: string[] | undefined;
                cc?: string[] | undefined;
                emailSubject?: string | undefined;
                threadMessages?: {
                    subject: string;
                    to: string[];
                    body: string;
                    from: string;
                    cc?: string[] | undefined;
                }[] | undefined;
            };
            output: {
                newBody: string;
            };
            meta: object;
        }>;
        generateEmailSubject: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                message: string;
            };
            output: {
                subject: string;
            };
            meta: object;
        }>;
        rewriteEmail: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                content: string;
                mode: "correct" | "rewrite";
                mood?: string | undefined;
            };
            output: {
                html: string;
                model: string;
            };
            meta: object;
        }>;
        webSearch: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                query: string;
            };
            output: import("ai").GenerateTextResult<import("ai").ToolSet, never>;
            meta: object;
        }>;
    }>>;
    copilot: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        ask: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                question: string;
                history?: {
                    role: "user" | "assistant";
                    content: string;
                }[] | undefined;
                context?: {
                    threadId?: string | undefined;
                    attachments?: {
                        name: string;
                        type: string;
                        size: number;
                        text: string;
                    }[] | undefined;
                    draft?: {
                        subject?: string | undefined;
                        to?: string | undefined;
                        body?: string | undefined;
                    } | undefined;
                    folder?: "inbox" | "sent" | "archive" | "spam" | "trash" | "bin" | "draft" | "snoozed" | undefined;
                    selectedThreadIds?: string[] | undefined;
                } | undefined;
            };
            output: import("../lib/ask-reta/schema").AskRetaResult;
            meta: object;
        }>;
        searchPreview: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                query: string;
                folder?: "inbox" | "sent" | "archive" | "spam" | "trash" | "bin" | "draft" | "snoozed" | undefined;
            };
            output: {
                threads: import("../lib/ask-reta/schema").AskRetaStepThread[];
            };
            meta: object;
        }>;
        modelCatalog: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                selectedModelId: string;
                vaultAvailable: boolean;
                consentVersion: string;
                models: {
                    id: string;
                    provider: import("../lib/ask-reta/catalogue").RetaProviderId;
                    label: string;
                    requiresCredential: boolean;
                    configured: boolean;
                }[];
            };
            meta: object;
        }>;
        setCredential: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                provider: "anthropic" | "openai" | "gemini" | "moonshot" | "zai";
                consentVersion: "2026-08-01";
                apiKey: string;
                acceptsMailboxEgress: true;
            };
            output: {
                ok: true;
            };
            meta: object;
        }>;
        deleteCredential: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                provider: "anthropic" | "openai" | "gemini" | "moonshot" | "zai";
            };
            output: {
                ok: true;
            };
            meta: object;
        }>;
        selectModel: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                modelId: string;
            };
            output: {
                selectedModelId: string;
            };
            meta: object;
        }>;
    }>>;
    bimi: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getByEmail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                email: string;
            };
            output: {
                domain: string;
                bimiRecord: {
                    version?: string | undefined;
                    logoUrl?: string | undefined;
                    authorityUrl?: string | undefined;
                } | null;
                logo: {
                    url: string;
                    svgContent: string;
                } | null;
            };
            meta: object;
        }>;
        getByDomain: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                domain: string;
            };
            output: {
                domain: string;
                bimiRecord: {
                    version?: string | undefined;
                    logoUrl?: string | undefined;
                    authorityUrl?: string | undefined;
                } | null;
                logo: {
                    url: string;
                    svgContent: string;
                } | null;
            };
            meta: object;
        }>;
    }>>;
    brain: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        enableBrain: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: boolean;
            meta: object;
        }>;
        disableBrain: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: void;
            meta: object;
        }>;
        generateSummary: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                threadId: string;
            };
            output: {
                data: {
                    short: string;
                };
            } | null;
            meta: object;
        }>;
        getState: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                enabled: boolean;
            };
            meta: object;
        }>;
        getLabels: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                name: string;
                usecase: string;
            }[];
            meta: object;
        }>;
        getPrompts: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: Record<import("@zero/types").EPrompts, string>;
            meta: object;
        }>;
        updatePrompt: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                content: string;
                promptType: import("@zero/types").EPrompts;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        updateLabels: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labels: {
                    name: string;
                    usecase: string;
                }[];
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    categories: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        defaults: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                name: string;
                id: string;
                searchValue: string;
                order: number;
                isDefault: boolean;
                icon?: string | undefined;
            }[];
            meta: object;
        }>;
    }>>;
    connections: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                connections: {
                    id: string;
                    email: string;
                    name: string | null;
                    picture: string | null;
                    createdAt: Date;
                    providerId: "google" | "microsoft";
                }[];
                disconnectedIds: string[];
            };
            meta: object;
        }>;
        setDefault: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                connectionId: string;
            };
            output: void;
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                connectionId: string;
            };
            output: void;
            meta: object;
        }>;
        getDefault: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: string;
                email: string;
                name: string | null;
                picture: string | null;
                createdAt: Date;
                providerId: "google" | "microsoft";
            } | null;
            meta: object;
        }>;
    }>>;
    cookiePreferences: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getPreferences: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("../lib/cookies").CookiePreferences;
            meta: object;
        }>;
        updatePreferences: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                enabled: boolean;
                category: "necessary" | "functional" | "analytics" | "marketing";
            };
            output: import("../lib/cookies").CookiePreferences;
            meta: object;
        }>;
    }>>;
    drafts: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                message: string;
                id: string | null;
                subject: string;
                to: string;
                threadId: string | null;
                fromEmail: string | null;
                cc?: string | undefined;
                bcc?: string | undefined;
                attachments?: {
                    name: string;
                    base64: string;
                    type: string;
                    size: number;
                    lastModified: number;
                }[] | undefined;
            };
            output: {
                id?: string | null | undefined;
                success?: boolean | undefined;
                error?: string | undefined;
            } & Disposable;
            meta: object;
        }>;
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: import("@zero/types").ParsedDraft;
            meta: object;
        }>;
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                q?: string | undefined;
                maxResults?: number | undefined;
                pageToken?: string | undefined;
            };
            output: {
                threads: {
                    id: string;
                    historyId: string | null;
                    $raw: unknown;
                }[];
                nextPageToken: string | null;
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: boolean;
            meta: object;
        }>;
        deleteMany: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: {
                deleted: number;
            };
            meta: object;
        }>;
    }>>;
    labels: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                name: string;
                id: string;
                type: string;
                color?: {
                    backgroundColor: string;
                    textColor: string;
                } | undefined;
            }[];
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                color?: {
                    backgroundColor: string;
                    textColor: string;
                } | undefined;
            };
            output: void;
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                id: string;
                type?: string | undefined;
                color?: {
                    backgroundColor: string;
                    textColor: string;
                } | undefined;
            };
            output: void;
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: void;
            meta: object;
        }>;
    }>>;
    mail: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        mailboxOverview: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                connectionId: string;
                todayStartMs: number;
                weekStartMs: number;
            };
            output: {
                folders: {
                    queue: number;
                    inbox: number;
                    drafts: number;
                    sent: number;
                };
                activity: {
                    processedToday: number;
                    processedWeek: number;
                    estimatedMinutesSaved: number;
                };
            };
            meta: object;
        }>;
        suggestRecipients: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                query?: string | undefined;
                limit?: number | undefined;
            };
            output: {
                email: string;
                name: string | null | undefined;
                displayText: string;
            }[] & Disposable;
            meta: object;
        }>;
        forceSync: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: void;
            meta: object;
        }>;
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: {
                messages: {
                    id: string;
                    title: string;
                    subject: string;
                    tags: {
                        name: string;
                        id: string;
                        type: string;
                    }[];
                    sender: {
                        email: string;
                        name?: string | undefined;
                    };
                    to: {
                        email: string;
                        name?: string | undefined;
                    }[];
                    cc: {
                        email: string;
                        name?: string | undefined;
                    }[] | null;
                    bcc: {
                        email: string;
                        name?: string | undefined;
                    }[] | null;
                    tls: boolean;
                    receivedOn: string;
                    unread: boolean;
                    body: string;
                    processedHtml: string;
                    blobUrl: string;
                    connectionId?: string | undefined;
                    listUnsubscribe?: string | undefined;
                    listUnsubscribePost?: string | undefined;
                    decodedBody?: string | undefined;
                    references?: string | undefined;
                    inReplyTo?: string | undefined;
                    replyTo?: string | undefined;
                    messageId?: string | undefined;
                    threadId?: string | undefined;
                    attachments?: {
                        body: string;
                        attachmentId: string;
                        filename: string;
                        mimeType: string;
                        size: number;
                        headers: {
                            name: string | null;
                            value: string | null;
                        }[];
                    }[] | undefined;
                    isDraft?: boolean | undefined;
                }[];
                hasUnread: boolean;
                totalReplies: number;
                labels: {
                    name: string;
                    id: string;
                }[];
                latest?: {
                    id: string;
                    title: string;
                    subject: string;
                    tags: {
                        name: string;
                        id: string;
                        type: string;
                    }[];
                    sender: {
                        email: string;
                        name?: string | undefined;
                    };
                    to: {
                        email: string;
                        name?: string | undefined;
                    }[];
                    cc: {
                        email: string;
                        name?: string | undefined;
                    }[] | null;
                    bcc: {
                        email: string;
                        name?: string | undefined;
                    }[] | null;
                    tls: boolean;
                    receivedOn: string;
                    unread: boolean;
                    body: string;
                    processedHtml: string;
                    blobUrl: string;
                    connectionId?: string | undefined;
                    listUnsubscribe?: string | undefined;
                    listUnsubscribePost?: string | undefined;
                    decodedBody?: string | undefined;
                    references?: string | undefined;
                    inReplyTo?: string | undefined;
                    replyTo?: string | undefined;
                    messageId?: string | undefined;
                    threadId?: string | undefined;
                    attachments?: {
                        body: string;
                        attachmentId: string;
                        filename: string;
                        mimeType: string;
                        size: number;
                        headers: {
                            name: string | null;
                            value: string | null;
                        }[];
                    }[] | undefined;
                    isDraft?: boolean | undefined;
                } | undefined;
            };
            meta: object;
        }>;
        openThread: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
                theme?: "light" | "dark" | undefined;
                shouldLoadImages?: boolean | undefined;
            };
            output: {
                thread: {
                    messages: {
                        id: string;
                        title: string;
                        subject: string;
                        tags: {
                            name: string;
                            id: string;
                            type: string;
                        }[];
                        sender: {
                            email: string;
                            name?: string | undefined;
                        };
                        to: {
                            email: string;
                            name?: string | undefined;
                        }[];
                        cc: {
                            email: string;
                            name?: string | undefined;
                        }[] | null;
                        bcc: {
                            email: string;
                            name?: string | undefined;
                        }[] | null;
                        tls: boolean;
                        receivedOn: string;
                        unread: boolean;
                        body: string;
                        processedHtml: string;
                        blobUrl: string;
                        connectionId?: string | undefined;
                        listUnsubscribe?: string | undefined;
                        listUnsubscribePost?: string | undefined;
                        decodedBody?: string | undefined;
                        references?: string | undefined;
                        inReplyTo?: string | undefined;
                        replyTo?: string | undefined;
                        messageId?: string | undefined;
                        threadId?: string | undefined;
                        attachments?: {
                            body: string;
                            attachmentId: string;
                            filename: string;
                            mimeType: string;
                            size: number;
                            headers: {
                                name: string | null;
                                value: string | null;
                            }[];
                        }[] | undefined;
                        isDraft?: boolean | undefined;
                    }[];
                    hasUnread: boolean;
                    totalReplies: number;
                    labels: {
                        name: string;
                        id: string;
                    }[];
                    latest?: {
                        id: string;
                        title: string;
                        subject: string;
                        tags: {
                            name: string;
                            id: string;
                            type: string;
                        }[];
                        sender: {
                            email: string;
                            name?: string | undefined;
                        };
                        to: {
                            email: string;
                            name?: string | undefined;
                        }[];
                        cc: {
                            email: string;
                            name?: string | undefined;
                        }[] | null;
                        bcc: {
                            email: string;
                            name?: string | undefined;
                        }[] | null;
                        tls: boolean;
                        receivedOn: string;
                        unread: boolean;
                        body: string;
                        processedHtml: string;
                        blobUrl: string;
                        connectionId?: string | undefined;
                        listUnsubscribe?: string | undefined;
                        listUnsubscribePost?: string | undefined;
                        decodedBody?: string | undefined;
                        references?: string | undefined;
                        inReplyTo?: string | undefined;
                        replyTo?: string | undefined;
                        messageId?: string | undefined;
                        threadId?: string | undefined;
                        attachments?: {
                            body: string;
                            attachmentId: string;
                            filename: string;
                            mimeType: string;
                            size: number;
                            headers: {
                                name: string | null;
                                value: string | null;
                            }[];
                        }[] | undefined;
                        isDraft?: boolean | undefined;
                    } | undefined;
                };
                rendered: Record<string, {
                    html: string;
                    hasBlockedImages: boolean;
                }>;
                timings: {
                    getThreadMs: number;
                    renderMs: number;
                };
            };
            meta: object;
        }>;
        listThreads: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                folder?: string | undefined;
                q?: string | undefined;
                maxResults?: number | undefined;
                labelIds?: string[] | undefined;
                cursor?: string | undefined;
                localPreview?: boolean | undefined;
            };
            output: {
                threads: {
                    id: string;
                    historyId: string | null;
                    subject?: string | undefined;
                    sender?: {
                        email: string;
                        name?: string | undefined;
                    } | undefined;
                    receivedOn?: string | undefined;
                    unread?: boolean | undefined;
                    labels?: {
                        name: string;
                        id: string;
                    }[] | undefined;
                    $raw?: unknown;
                }[];
                nextPageToken: string | null;
            };
            meta: object;
        }>;
        markAsRead: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        markAsUnread: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        markAsImportant: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        modifyLabels: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                threadId: string[];
                addLabels?: string[] | undefined;
                removeLabels?: string[] | undefined;
            };
            output: {
                success: boolean;
                error?: undefined;
            } | {
                success: boolean;
                error: string;
            };
            meta: object;
        }>;
        toggleStar: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: {
                success: boolean;
                error: string;
            } | {
                success: boolean;
                error?: undefined;
            };
            meta: object;
        }>;
        toggleImportant: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: {
                success: boolean;
                error: string;
            } | {
                success: boolean;
                error?: undefined;
            };
            meta: object;
        }>;
        bulkStar: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        bulkMarkImportant: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        bulkUnstar: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        deleteAllSpam: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: import("../types").DeleteAllSpamResponse;
            meta: object;
        }>;
        bulkUnmarkImportant: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        send: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                message: string;
                subject: string;
                to: {
                    email: string;
                    name?: string | undefined;
                }[];
                cc?: {
                    email: string;
                    name?: string | undefined;
                }[] | undefined;
                bcc?: {
                    email: string;
                    name?: string | undefined;
                }[] | undefined;
                threadId?: string | undefined;
                headers?: Record<string, string> | undefined;
                attachments?: {
                    name: string;
                    base64: string;
                    type: string;
                    size: number;
                    lastModified: number;
                }[] | undefined;
                fromEmail?: string | undefined;
                teamThreadId?: string | undefined;
                draftId?: string | undefined;
                reviewId?: string | undefined;
                isForward?: boolean | undefined;
                originalMessage?: string | undefined;
                sendAsStored?: boolean | undefined;
                scheduleAt?: string | undefined;
                clientSendId?: string | undefined;
                replyIntentId?: string | undefined;
                overrideCollision?: boolean | undefined;
            };
            output: {
                readonly success: false;
                readonly error: string;
                readonly queued?: undefined;
                readonly messageId?: undefined;
                readonly sendAt?: undefined;
                readonly duplicate?: undefined;
                readonly scheduled?: undefined;
            } | {
                readonly success: true;
                readonly queued: true;
                readonly messageId: string;
                readonly sendAt: number | undefined;
                readonly duplicate: true;
                error?: undefined;
                readonly scheduled?: undefined;
            } | {
                readonly success: true;
                readonly scheduled: true;
                readonly messageId: string;
                readonly sendAt: number;
                readonly duplicate: true;
                error?: undefined;
                readonly queued?: undefined;
            } | {
                readonly success: true;
                readonly scheduled: true;
                readonly messageId: string;
                readonly sendAt: number;
                error?: undefined;
                readonly queued?: undefined;
                readonly duplicate?: undefined;
            } | {
                readonly success: true;
                readonly queued: true;
                readonly messageId: string;
                readonly sendAt: number;
                error?: undefined;
                readonly duplicate?: undefined;
                readonly scheduled?: undefined;
            } | {
                readonly success: false;
                readonly error: "collision";
                readonly collision: {
                    readonly reasons: ({
                        type: "inbound_member_reply";
                        senderEmail: string;
                        receivedOn: string;
                    } | {
                        type: "reta_reply_accepted";
                        userId: string;
                        acceptedAt: string;
                    } | {
                        type: "active_claim";
                        userId: string;
                        since: string;
                    })[];
                };
            } | {
                readonly success: false;
                readonly error: "collision";
                readonly collision: {
                    readonly reasons: readonly [{
                        readonly type: "active_claim";
                        readonly userId: "unknown";
                        readonly since: "";
                    }];
                };
            } | {
                readonly teamClaimResolution: "failed" | "accepted";
                readonly teamReviewClosure: "failed" | "closed" | "none";
                readonly success: true;
                readonly queued: true;
                readonly messageId: string;
                readonly sendAt: number | undefined;
                readonly duplicate: true;
                readonly error?: undefined;
                readonly scheduled?: undefined;
                readonly collision?: undefined;
            } | {
                readonly teamClaimResolution: "failed" | "accepted";
                readonly teamReviewClosure: "failed" | "closed" | "none";
                readonly success: true;
                readonly scheduled: true;
                readonly messageId: string;
                readonly sendAt: number;
                readonly duplicate: true;
                readonly error?: undefined;
                readonly queued?: undefined;
                readonly collision?: undefined;
            } | {
                readonly teamClaimResolution: "failed" | "accepted";
                readonly teamReviewClosure: "failed" | "closed" | "none";
                readonly success: true;
                readonly scheduled: true;
                readonly messageId: string;
                readonly sendAt: number;
                readonly error?: undefined;
                readonly queued?: undefined;
                readonly duplicate?: undefined;
                readonly collision?: undefined;
            } | {
                readonly teamClaimResolution: "failed" | "accepted";
                readonly teamReviewClosure: "failed" | "closed" | "none";
                readonly success: true;
                readonly queued: true;
                readonly messageId: string;
                readonly sendAt: number;
                readonly error?: undefined;
                readonly duplicate?: undefined;
                readonly scheduled?: undefined;
                readonly collision?: undefined;
            };
            meta: object;
        }>;
        getSendStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                messageId: string;
            };
            output: {
                status: "unknown";
                error: null;
                sendAt: null;
            } | {
                status: "sent" | "failed" | "sending" | "queued" | "cancelled";
                error: string | null;
                sendAt: number | null;
            };
            meta: object;
        }>;
        listSendJobs: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                statuses?: ("sent" | "failed" | "sending" | "queued" | "cancelled")[] | undefined;
            } | undefined;
            output: {
                id: string;
                status: "sent" | "failed" | "sending" | "queued" | "cancelled";
                error: string | null;
                subject: string | null;
                to: string[];
                sendAt: number | null;
                createdAt: number;
            }[];
            meta: object;
        }>;
        retrySend: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                messageId: string;
            };
            output: {
                readonly success: false;
                readonly error: "Send job not found";
                readonly queued?: undefined;
                readonly messageId?: undefined;
            } | {
                readonly success: false;
                readonly error: "Send was cancelled";
                readonly queued?: undefined;
                readonly messageId?: undefined;
            } | {
                readonly success: true;
                readonly queued: true;
                readonly messageId: string;
                error?: undefined;
            } | {
                readonly success: false;
                readonly error: "Send job changed state; refresh and retry";
                readonly queued?: undefined;
                readonly messageId?: undefined;
            };
            meta: object;
        }>;
        unsend: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                messageId: string;
            };
            output: {
                readonly success: true;
                error?: undefined;
            } | {
                readonly success: false;
                readonly error: "Too late to cancel (status: sent)" | "Too late to cancel (status: failed)" | "Too late to cancel (status: sending)" | "Too late to cancel (status: queued)" | "Too late to cancel (status: cancelled)";
            } | {
                readonly success: false;
                readonly error: "Unauthorized: Cannot cancel another user's scheduled email";
            } | {
                readonly success: false;
                readonly error: "Invalid scheduled email data";
            } | {
                readonly success: false;
                readonly error: "Unauthorized: Cannot cancel another user's queued email";
            } | {
                readonly success: false;
                readonly error: "Invalid payload data";
            } | {
                success: boolean;
                error?: undefined;
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: boolean;
            meta: object;
        }>;
        bulkDelete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        bulkArchive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        bulkMute: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: void[];
            meta: object;
        }>;
        getEmailAliases: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                email: string;
                name?: string | undefined;
                primary?: boolean | undefined;
            }[] & Disposable;
            meta: object;
        }>;
        getUpcomingSnoozes: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("../lib/snooze-upcoming").UpcomingSnoozes;
            meta: object;
        }>;
        snoozeThreads: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                wakeAt: string;
                ids: string[];
            };
            output: {
                success: boolean;
                error: string;
            } | {
                success: boolean;
                error?: undefined;
            };
            meta: object;
        }>;
        unsnoozeThreads: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[];
            };
            output: {
                success: boolean;
                error: string;
            } | {
                success: boolean;
                error?: undefined;
            };
            meta: object;
        }>;
        getMessageAttachments: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                messageId: string;
                inlineOnly?: boolean | undefined;
            };
            output: {
                filename: string;
                mimeType: string;
                size: number;
                attachmentId: string;
                contentId: string | null;
                headers: {
                    name: string;
                    value: string;
                }[];
                body: string;
            }[];
            meta: object;
        }>;
        processEmailContent: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                html: string;
                theme: "light" | "dark";
                shouldLoadImages: boolean;
            };
            output: {
                processedHtml: string;
                hasBlockedImages: boolean;
            };
            meta: object;
        }>;
        getRawEmail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: string;
            meta: object;
        }>;
        verifyEmail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: {
                isVerified: boolean;
                logoUrl?: string;
            };
            meta: object;
        }>;
    }>>;
    notes: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                threadId: string;
            };
            output: {
                notes: {
                    id: string;
                    threadId: string;
                    content: string;
                    order: number;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    color: string;
                    isPinned: boolean | null;
                }[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                threadId: string;
                content: string;
                color?: string | undefined;
                isPinned?: boolean | undefined;
            };
            output: {
                note: {
                    id: string;
                    threadId: string;
                    content: string;
                    order: number;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    color: string;
                    isPinned: boolean | null;
                };
            };
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                data: {
                    threadId?: string | undefined;
                    content?: string | undefined;
                    color?: string | undefined;
                    isPinned?: boolean | undefined;
                };
                noteId: string;
            };
            output: {
                note: {
                    id: string;
                    threadId: string;
                    content: string;
                    order: number;
                    createdAt: Date;
                    updatedAt: Date;
                    userId: string;
                    color: string;
                    isPinned: boolean | null;
                };
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                noteId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        reorder: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                notes: {
                    id: string;
                    order: number;
                    isPinned?: boolean | null | undefined;
                }[];
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    outbox: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "sent" | "failed" | "sending" | "queued" | "generating" | "draft_ready" | "approved" | "cancelled" | undefined;
            } | undefined;
            output: import("../lib/draft-outbox").DraftOutboxItem[];
            meta: object;
        }>;
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: import("../lib/draft-outbox").DraftOutboxItem;
            meta: object;
        }>;
        enqueue: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                connectionId: string;
                subject?: string | undefined;
                body?: string | undefined;
                threadId?: string | undefined;
                mission?: string | undefined;
            };
            output: {
                id: string;
            };
            meta: object;
        }>;
        approve: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: import("../lib/draft-outbox").DraftOutboxItem | undefined;
            meta: object;
        }>;
        cancel: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: import("../lib/draft-outbox").DraftOutboxItem | undefined;
            meta: object;
        }>;
        retry: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: import("../lib/draft-outbox").DraftOutboxItem | undefined;
            meta: object;
        }>;
    }>>;
    shortcut: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                shortcuts: {
                    keys: string[];
                    type: "single" | "combination";
                    scope: string;
                    action: string;
                    description: string;
                    preventDefault?: boolean | undefined;
                }[];
            };
            output: void;
            meta: object;
        }>;
    }>>;
    settings: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        get: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                settings: {
                    language: string;
                    timezone: string;
                    externalImages: boolean;
                    customPrompt: string;
                    colorTheme: "light" | "dark" | "system";
                    zeroSignature: boolean;
                    undoSendEnabled: boolean;
                    confirmDirectDraftSend: boolean;
                    predictiveWritingEnabled: boolean;
                    imageCompression: "low" | "medium" | "original";
                    autoRead: boolean;
                    animations: boolean;
                    askRetaModel: string;
                    dynamicContent?: boolean | undefined;
                    isOnboarded?: boolean | undefined;
                    trustedSenders?: string[] | undefined;
                    categories?: {
                        name: string;
                        id: string;
                        searchValue: string;
                        order: number;
                        isDefault: boolean;
                        icon?: string | undefined;
                    }[] | undefined;
                    defaultEmailAlias?: string | undefined;
                };
            };
            meta: object;
        }>;
        save: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                language?: string | undefined;
                timezone?: string | undefined;
                dynamicContent?: boolean | undefined;
                externalImages?: boolean | undefined;
                customPrompt?: string | undefined;
                isOnboarded?: boolean | undefined;
                trustedSenders?: string[] | undefined;
                colorTheme?: "light" | "dark" | "system" | undefined;
                zeroSignature?: boolean | undefined;
                categories?: {
                    name: string;
                    id: string;
                    searchValue: string;
                    order: number;
                    icon?: string | undefined;
                    isDefault?: boolean | undefined;
                }[] | undefined;
                defaultEmailAlias?: string | undefined;
                undoSendEnabled?: boolean | undefined;
                confirmDirectDraftSend?: boolean | undefined;
                predictiveWritingEnabled?: boolean | undefined;
                imageCompression?: "low" | "medium" | "original" | undefined;
                autoRead?: boolean | undefined;
                animations?: boolean | undefined;
                askRetaModel?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    user: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: {
                success: boolean;
                message: string;
            };
            meta: object;
        }>;
        getIntercomToken: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: string;
            meta: object;
        }>;
    }>>;
    teams: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
            };
            output: {
                id: string;
                name: string;
            } & Disposable;
            meta: object;
        }>;
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                teams: {
                    id: string;
                    name: string;
                    role: "owner" | "member";
                    prefs: {
                        onComment: boolean;
                        onMention: boolean;
                        onAssignment: boolean;
                        onboardingDismissedAt?: string | null | undefined;
                    };
                    createdAt: Date;
                    memberCount: number;
                }[] & Disposable;
            };
            meta: object;
        }>;
        rename: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                teamId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        leave: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listMembers: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                members: {
                    userId: string;
                    role: "owner" | "member";
                    name: string;
                    email: string;
                    image: string | null;
                    joinedAt: Date;
                }[] & Disposable;
            };
            meta: object;
        }>;
        removeMember: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
                teamId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        updateMyPrefs: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                prefs: {
                    onComment: boolean;
                    onMention: boolean;
                    onAssignment: boolean;
                };
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        onboardingStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                teamId: string;
                teamCreatedAt: string;
                steps: {
                    team_created: {
                        done: boolean;
                        at: string | null;
                    };
                    invite_accepted: {
                        done: boolean;
                        at: string | null;
                    };
                    first_share: {
                        done: boolean;
                        at: string | null;
                    };
                    first_comment: {
                        done: boolean;
                        at: string | null;
                    };
                    first_assignment_done: {
                        done: boolean;
                        at: string | null;
                    };
                };
                inviteSent: boolean;
                loopCompletedAt: string | null;
                loopElapsedMs: number | null;
                dismissedAt: string | null;
            } & Disposable;
            meta: object;
        }>;
        setOnboardingDismissed: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                dismissed: boolean;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listRules: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                rules: {
                    id: string;
                    teamId: string;
                    name: string;
                    enabled: boolean;
                    createdBy: string;
                    createdByName: string;
                    watchesEmail: string;
                    triggers: {
                        senders?: string[] | undefined;
                        domains?: string[] | undefined;
                        recipients?: string[] | undefined;
                        keywords?: string[] | undefined;
                        gmailLabels?: string[] | undefined;
                        hours?: {
                            days?: number[] | undefined;
                            from: string;
                            to: string;
                            timeZone: string;
                        } | undefined;
                    };
                    actions: ({
                        kind: "share";
                        visibility: "team";
                    } | {
                        kind: "assign";
                        userId: string;
                    } | {
                        kind: "label";
                        labelIds: string[];
                    } | {
                        kind: "todo";
                        assigneeUserId?: string | undefined;
                    } | {
                        kind: "snooze";
                        hours: number;
                    } | {
                        kind: "notify";
                        userIds: string[];
                    })[];
                    createdAt: Date;
                    updatedAt: Date;
                }[] & Disposable;
            };
            meta: object;
        }>;
        createRule: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                actions: ({
                    kind: "share";
                    visibility: "team";
                } | {
                    kind: "assign";
                    userId: string;
                } | {
                    kind: "label";
                    labelIds: string[];
                } | {
                    kind: "todo";
                    assigneeUserId?: string | undefined;
                } | {
                    kind: "snooze";
                    hours: number;
                } | {
                    kind: "notify";
                    userIds: string[];
                })[];
                teamId: string;
                triggers: {
                    senders?: string[] | undefined;
                    domains?: string[] | undefined;
                    recipients?: string[] | undefined;
                    keywords?: string[] | undefined;
                    gmailLabels?: string[] | undefined;
                    hours?: {
                        to: string;
                        timeZone: string;
                        from: string;
                        days?: number[] | undefined;
                    } | undefined;
                };
                confirmAclExpansion?: boolean | undefined;
            };
            output: {
                id: string;
            } & Disposable;
            meta: object;
        }>;
        updateRule: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ruleId: string;
                name?: string | undefined;
                actions?: ({
                    kind: "share";
                    visibility: "team";
                } | {
                    kind: "assign";
                    userId: string;
                } | {
                    kind: "label";
                    labelIds: string[];
                } | {
                    kind: "todo";
                    assigneeUserId?: string | undefined;
                } | {
                    kind: "snooze";
                    hours: number;
                } | {
                    kind: "notify";
                    userIds: string[];
                })[] | undefined;
                triggers?: {
                    senders?: string[] | undefined;
                    domains?: string[] | undefined;
                    recipients?: string[] | undefined;
                    keywords?: string[] | undefined;
                    gmailLabels?: string[] | undefined;
                    hours?: {
                        to: string;
                        timeZone: string;
                        from: string;
                        days?: number[] | undefined;
                    } | undefined;
                } | undefined;
                confirmAclExpansion?: boolean | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        setRuleEnabled: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                enabled: boolean;
                ruleId: string;
                confirmAclExpansion?: boolean | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        deleteRule: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ruleId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listRuleRuns: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                limit?: number | undefined;
                teamThreadId?: string | undefined;
                ruleId?: string | undefined;
            };
            output: {
                runs: {
                    ruleDeletedAt: string | null;
                    actionsApplied: {
                        kind: import("../lib/teams/team-rules-shared").RuleActionKind;
                        ok: boolean;
                        reason?: string | undefined;
                    }[];
                    id: string;
                    ruleId: string;
                    ruleName: string;
                    threadId: string;
                    teamThreadId: string | null;
                    subject: string | null;
                    outcome: "error" | "undone" | "processing" | "applied" | "skipped";
                    reason: string;
                    createdAt: Date;
                    undoneAt: Date | null;
                }[] & Disposable;
            };
            meta: object;
        }>;
        previewRule: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                triggers: {
                    senders?: string[] | undefined;
                    domains?: string[] | undefined;
                    recipients?: string[] | undefined;
                    keywords?: string[] | undefined;
                    gmailLabels?: string[] | undefined;
                    hours?: {
                        to: string;
                        timeZone: string;
                        from: string;
                        days?: number[] | undefined;
                    } | undefined;
                };
                limit?: number | undefined;
            };
            output: {
                rows: {
                    threadId: string;
                    subject: string;
                    senderEmail: string;
                    verdict: {
                        matched: boolean;
                        partial: boolean;
                        reasons: {
                            trigger: import("../lib/teams/team-rules-shared").TriggerFamily;
                            matched: boolean;
                            detail: string;
                            unavailable?: boolean | undefined;
                        }[];
                    } | null;
                }[] & Disposable;
            };
            meta: object;
        }>;
        undoRuleRun: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                runId: string;
            };
            output: {
                status: "undone" | "conflicted" | "failed";
                conflicts: string[];
                undone: {
                    kind: import("../lib/teams/team-rules-shared").RuleActionKind;
                    ok: boolean;
                    reason?: string | undefined;
                }[];
            } & Disposable;
            meta: object;
        }>;
        requestDraftReview: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamThreadId: string;
                draftId: string;
                reviewerUserId: string;
            };
            output: {
                id: string;
            } & Disposable;
            meta: object;
        }>;
        threadDraftReview: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                review: ({
                    reviewerName: string;
                    isParty: boolean;
                    suggestions: {
                        authorName: string;
                        id: string;
                        authorUserId: string;
                        bodyText: string;
                        note: string;
                        baseDigest: string;
                        appliedAt: Date | null;
                        createdAt: Date;
                    }[];
                    id: string;
                    teamThreadId: string;
                    ownerUserId: string;
                    reviewerUserId: string;
                    state: "approved" | "cancelled" | "requested" | "changes_requested" | "completed";
                    revision: number;
                    draftDigest: string;
                    createdAt: Date;
                    updatedAt: Date;
                    ownerName: string | null;
                } & Disposable) | null;
            };
            meta: object;
        }>;
        readReviewDraft: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                reviewId: string;
            };
            output: {
                snapshot: {
                    subject: string;
                    bodyText: string;
                    to: string[];
                    cc: string[];
                    bcc: string[];
                };
                currentDigest: string;
                reviewDigest: string;
                stale: boolean;
                state: "approved" | "cancelled" | "requested" | "changes_requested" | "completed";
                revision: number;
            } & Disposable;
            meta: object;
        }>;
        suggestDraftEdit: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reviewId: string;
                bodyText: string;
                baseDigest: string;
                note?: string | undefined;
            };
            output: {
                id: string;
            } & Disposable;
            meta: object;
        }>;
        draftReviewDecision: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reviewId: string;
                baseDigest: string;
                decision: "approved" | "changes_requested";
            };
            output: {
                state: "approved" | "changes_requested";
                revision: number;
            } & Disposable;
            meta: object;
        }>;
        rebaseDraftReview: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reviewId: string;
            };
            output: {
                revision: number;
            } & Disposable;
            meta: object;
        }>;
        applyDraftSuggestion: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                suggestionId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        createReplyIntent: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                id: string;
                baselineAt: string;
                expiresAt: string;
            } & Disposable;
            meta: object;
        }>;
        cancelDraftReview: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reviewId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getSlaPolicy: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                policy: {
                    teamId: string;
                    firstResponseMinutes: number | null;
                    resolutionMinutes: number | null;
                    timeZone: string;
                    businessHours: {
                        days: number[];
                        start: string;
                        end: string;
                    };
                    updatedAt: Date;
                } & Disposable;
            };
            meta: object;
        }>;
        setSlaPolicy: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                firstResponseMinutes: number | null;
                resolutionMinutes: number | null;
                timeZone: string;
                businessHours: {
                    start: string;
                    end: string;
                    days: number[];
                };
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listAbsences: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                absences: {
                    userName: string;
                    id: string;
                    userId: string;
                    startsAt: Date;
                    endsAt: Date;
                    note: string;
                    createdBy: string;
                }[] & Disposable;
            };
            meta: object;
        }>;
        declareAbsence: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                startsAt: string;
                endsAt: string;
                targetUserId: string;
                note?: string | undefined;
            };
            output: {
                id: string;
            } & Disposable;
            meta: object;
        }>;
        removeAbsence: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                absenceId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        opsOverview: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                windowDays?: number | undefined;
            };
            output: {
                labelVolumes: {
                    labelId: string;
                    name: string;
                    shared: number;
                    resolved: number;
                }[];
                workload: {
                    userId: string;
                    name: string;
                    openAssigned: number;
                }[];
                coverage: {
                    availableCount: number;
                    totalCount: number;
                    rows: {
                        userId: string;
                        name: string;
                        absentUntil: string | null;
                    }[];
                };
                stuckProcessing: {
                    id: string;
                    ruleName: string;
                    ageMinutes: number;
                }[];
                limits: {
                    threadsTruncated: boolean;
                    eventsTruncated: boolean;
                    labelsTruncated: boolean;
                    maxThreads: number;
                    maxEvents: number;
                    maxLabelLinks: number;
                };
                reopenings: number;
                transfers: number;
                window: {
                    days: number;
                    from: string;
                    to: string;
                };
                sla: {
                    firstResponseMinutes: number | null;
                    resolutionMinutes: number | null;
                    timeZone: string;
                    businessHours: {
                        days: number[];
                        start: string;
                        end: string;
                    };
                } | null;
                counts: {
                    open: number;
                    unassigned: number;
                    sharedInWindow: number;
                    resolvedInWindow: number;
                };
                overdue: {
                    firstResponse: number | null;
                    resolution: number | null;
                };
                oldestOpenWithoutReply: {
                    teamThreadId: string;
                    subject: string;
                    sharedAt: string;
                } | null;
                firstResponse: {
                    medianMinutes: number | null;
                    p90Minutes: number | null;
                    sampleSize: number;
                };
                resolution: {
                    medianMinutes: number | null;
                    p90Minutes: number | null;
                    sampleSize: number;
                };
            } & Disposable;
            meta: object;
        }>;
        invite: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                email: string;
                teamId: string;
                role?: "owner" | "member" | undefined;
            };
            output: {
                id: string;
                email: string;
                role: import("../lib/teams/team-store").TeamRole;
            } & Disposable;
            meta: object;
        }>;
        listInvites: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                invites: {
                    id: string;
                    email: string;
                    role: "owner" | "member";
                    status: "pending" | "revoked" | "accepted" | "declined";
                    createdAt: Date;
                    invitedByName: string;
                }[] & Disposable;
            };
            meta: object;
        }>;
        revokeInvite: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                inviteId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        myInvites: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                invites: {
                    id: string;
                    teamId: string;
                    teamName: string;
                    role: "owner" | "member";
                    createdAt: Date;
                    invitedByName: string;
                }[] & Disposable;
            };
            meta: object;
        }>;
        acceptInvite: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                inviteId: string;
            };
            output: {
                teamId: string;
            } & Disposable;
            meta: object;
        }>;
        declineInvite: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                inviteId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        share: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                threadId: string;
                teamId: string;
                visibility?: "team" | "restricted" | undefined;
                accessUserIds?: string[] | undefined;
            };
            output: {
                share: {
                    id: string;
                    teamId: string;
                    threadId: string;
                    sharerUserId: string;
                    sharerEmail: string;
                    providerId: string;
                    visibility: "team" | "restricted";
                    subject: string;
                    preview: string;
                    participants: {
                        name?: string;
                        email: string;
                    }[];
                    messageCount: number;
                    latestReceivedOn: string | null;
                    status: "open" | "closed";
                    assigneeUserId: string | null;
                    lastActivityAt: Date;
                    createdAt: Date;
                };
            };
            meta: object;
        }>;
        unshare: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listThreads: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                status?: "open" | "closed" | undefined;
                limit?: number | undefined;
                assignee?: "me" | "unassigned" | {
                    userId: string;
                } | undefined;
                labelId?: string | undefined;
                cursor?: {
                    id: string;
                    lastActivityAt: string;
                } | null | undefined;
            };
            output: {
                threads: {
                    id: string;
                    teamId: string;
                    threadId: string;
                    sharerUserId: string;
                    sharerEmail: string;
                    providerId: string;
                    visibility: "team" | "restricted";
                    subject: string;
                    preview: string;
                    participants: {
                        name?: string | undefined;
                        email: string;
                    }[];
                    messageCount: number;
                    latestReceivedOn: string | null;
                    status: "open" | "closed";
                    assigneeUserId: string | null;
                    lastActivityAt: Date;
                    createdAt: Date;
                    sharerName: string;
                    commentCount: number;
                    labels: {
                        id: string;
                        name: string;
                        color: string;
                    }[];
                }[];
                nextCursor: {
                    lastActivityAt: string;
                    id: string;
                } | null;
            } & Disposable;
            meta: object;
        }>;
        sharesForThread: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                threadId: string;
            };
            output: {
                shares: {
                    id: string;
                    teamId: string;
                    teamName: string;
                    visibility: "team" | "restricted";
                    status: "open" | "closed";
                    assigneeUserId: string | null;
                    sharerUserId: string;
                    lastActivityAt: Date;
                    commentCount: number;
                }[] & Disposable;
            };
            meta: object;
        }>;
        getShare: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                share: {
                    id: string;
                    teamId: string;
                    threadId: string;
                    sharerUserId: string;
                    sharerEmail: string;
                    providerId: string;
                    visibility: "team" | "restricted";
                    subject: string;
                    preview: string;
                    participants: {
                        name?: string;
                        email: string;
                    }[];
                    messageCount: number;
                    latestReceivedOn: string | null;
                    status: "open" | "closed";
                    assigneeUserId: string | null;
                    lastActivityAt: Date;
                    createdAt: Date;
                };
            };
            meta: object;
        }>;
        readSharedThread: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                share: {
                    id: string;
                    teamId: string;
                    threadId: string;
                    sharerUserId: string;
                    sharerEmail: string;
                    providerId: string;
                    visibility: "team" | "restricted";
                    subject: string;
                    preview: string;
                    participants: {
                        name?: string;
                        email: string;
                    }[];
                    messageCount: number;
                    latestReceivedOn: string | null;
                    status: "open" | "closed";
                    assigneeUserId: string | null;
                    lastActivityAt: Date;
                    createdAt: Date;
                };
                thread: import("@zero/types").IGetThreadResponse;
            };
            meta: object;
        }>;
        readSharedAttachment: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                messageId: string;
                attachmentId: string;
                teamThreadId: string;
            };
            output: {
                filename: string;
                mimeType: string;
                size: number;
                body: string;
            };
            meta: object;
        }>;
        setStatus: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                status: "open" | "closed";
                teamThreadId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        assignSharedBatch: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                assigneeUserId: string | null;
                threadIds: string[];
            };
            output: {
                results: {
                    threadId: string;
                    outcome: import("../lib/teams/team-store").BatchAssignOutcome;
                    teamThreadId?: string | undefined;
                }[];
                assigned: number;
                notShared: number;
                skipped: number;
            };
            meta: object;
        }>;
        setAssignee: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                assigneeUserId: string | null;
                teamThreadId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listAccess: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                access: {
                    id: string;
                    userId: string;
                    name: string;
                    email: string;
                    source: "share" | "mention" | "manual";
                    grantedBy: string;
                    createdAt: Date;
                    revokedAt: Date | null;
                    revokedBy: string | null;
                }[] & Disposable;
            };
            meta: object;
        }>;
        grantAccess: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
                teamThreadId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        revokeAccess: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
                teamThreadId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        addComment: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                body: string;
                teamThreadId: string;
                mentions?: string[] | undefined;
                quoteMessageId?: string | undefined;
                quoteText?: string | undefined;
            };
            output: {
                comment: {
                    id: string;
                    body: string;
                    quote: {
                        messageId: string;
                        authorEmail: string;
                        authorName?: string | undefined;
                        receivedOn: string;
                        text: string;
                    } | null;
                    createdAt: Date;
                    updatedAt: Date;
                    teamThreadId: string;
                    authorUserId: string;
                    mentions: string[];
                } & Disposable;
            };
            meta: object;
        }>;
        editComment: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                body: string;
                commentId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        deleteComment: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                commentId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listComments: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                comments: {
                    id: string;
                    body: string;
                    mentions: string[];
                    quote: {
                        messageId: string;
                        authorEmail: string;
                        authorName?: string | undefined;
                        receivedOn: string;
                        text: string;
                    } | null;
                    createdAt: Date;
                    updatedAt: Date;
                    authorUserId: string;
                    authorName: string;
                    authorEmail: string;
                    reactions: {
                        emoji: string;
                        userId: string;
                    }[];
                }[] & Disposable;
            };
            meta: object;
        }>;
        toggleReaction: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                commentId: string;
                emoji: "👍" | "✅" | "👀" | "❤️" | "🔥" | "😂";
            };
            output: {
                reacted: boolean;
            };
            meta: object;
        }>;
        createLabel: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                teamId: string;
                color?: string | undefined;
            };
            output: {
                id: string;
                name: string;
                color: string;
            } & Disposable;
            meta: object;
        }>;
        deleteLabel: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labelId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listLabels: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                labels: {
                    id: string;
                    name: string;
                    color: string;
                    createdBy: string;
                }[] & Disposable;
            };
            meta: object;
        }>;
        setThreadLabels: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamThreadId: string;
                labelIds: string[];
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listNotifications: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                unreadOnly?: boolean | undefined;
            };
            output: {
                notifications: {
                    id: string;
                    teamId: string;
                    teamName: string;
                    teamThreadId: string | null;
                    threadSubject: string | null;
                    commentId: string | null;
                    kind: "comment" | "mention" | "assignment" | "access_granted" | "access_revoked" | "status_changed" | "rule" | "draft_review";
                    actorUserId: string;
                    actorName: string;
                    createdAt: Date;
                    readAt: Date | null;
                }[] & Disposable;
            };
            meta: object;
        }>;
        unreadNotificationCount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                count: number;
                mentions: number;
            };
            meta: object;
        }>;
        markNotificationsRead: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                ids: string[] | "all";
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listAudit: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                limit?: number | undefined;
            };
            output: {
                entries: never;
            };
            meta: object;
        }>;
        heartbeat: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamThreadId: string;
                typing?: boolean | undefined;
                replying?: boolean | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listPresence: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                presence: {
                    userId: string;
                    name: string;
                    email: string;
                    lastSeenAt: Date;
                    typingUntil: Date | null;
                    replyingUntil: Date | null;
                }[] & Disposable;
            };
            meta: object;
        }>;
        myCollabThreadSets: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                shared: string[];
                assigned: string[];
                commented: string[];
                mentioned: string[];
            } & Disposable;
            meta: object;
        }>;
        myAssignedOpenCount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                count: number;
            };
            meta: object;
        }>;
    }>>;
    integrations: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        overview: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                isOwner: boolean;
                vaultConfigured: boolean;
                oauthConfigured: boolean;
                install: {
                    id: string;
                    status: import("../lib/teams/team-integrations-shared").IntegrationInstallStatus;
                    workspaceId: string | null;
                    workspaceName: string | null;
                    scopes: string[];
                    hasAccessToken: boolean;
                    createdAt: Date;
                    revokedAt: Date | null;
                } | null;
                mappings: {
                    id: string;
                    kind: import("../lib/teams/team-integrations-shared").IntegrationMappingKind;
                    retaValue: string;
                    externalId: string;
                    externalLabel: string;
                }[];
            } & Disposable;
            meta: object;
        }>;
        beginInstall: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                reconnectConfirm?: boolean | undefined;
            };
            output: {
                authorizeUrl: string;
            } & Disposable;
            meta: object;
        }>;
        completeInstall: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                code: string;
                state: string;
            };
            output: {
                workspaceName: string;
            } & Disposable;
            meta: object;
        }>;
        revokeInstall: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
            };
            output: {
                revoked: true;
                remote: "ok" | "failed" | "skipped";
            } & Disposable;
            meta: object;
        }>;
        setMapping: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                kind: "status" | "team" | "assignee";
                teamId: string;
                retaValue: string;
                externalId: string;
                externalLabel?: string | undefined;
            };
            output: {
                ok: boolean;
            } & Disposable;
            meta: object;
        }>;
        listLinearTargets: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                linearTeamId?: string | undefined;
            };
            output: {
                teams: {
                    id: string;
                    name: string;
                }[];
                users: {
                    id: string;
                    name: string;
                    email: string;
                }[];
                states: {
                    id: string;
                    name: string;
                    type: string;
                }[] | null;
            } & Disposable;
            meta: object;
        }>;
        threadIntegration: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamThreadId: string;
            };
            output: {
                installStatus: import("../lib/teams/team-integrations-shared").IntegrationInstallStatus;
                subject: string;
                issueLinks: {
                    id: string;
                    issueId: string;
                    issueIdentifier: string;
                    issueUrl: string;
                    createdAt: Date;
                }[];
                externalLinks: {
                    id: string;
                    kind: import("../lib/teams/team-integrations-shared").ExternalLinkKind;
                    label: string;
                    url: string;
                    createdBy: string | null;
                    createdAt: Date;
                }[];
                allowedTeams: {
                    id: string;
                    label: string;
                }[];
                statusMappings: {
                    retaStatus: string;
                    externalId: string;
                    label: string;
                }[];
                assigneeMappings: {
                    userId: string;
                    externalId: string;
                    label: string;
                }[];
            } & Disposable;
            meta: object;
        }>;
        previewIssue: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamThreadId: string;
                clientRequestKey: string;
                linearTeamId: string;
                title?: string | null | undefined;
                note?: string | null | undefined;
                assigneeUserId?: string | null | undefined;
                stateId?: string | null | undefined;
            };
            output: ({
                title: string;
                description: string;
                backlinkUrl: string;
                digest: string;
                expiresAt: string;
                status: "previewed";
                previewId: string;
                issueId?: undefined;
                issueIdentifier?: undefined;
                issueUrl?: undefined;
            } & Disposable) | ({
                previewId: string;
                status: "created";
                issueId: string;
                issueIdentifier: string;
                issueUrl: string;
            } & Disposable);
            meta: object;
        }>;
        confirmIssue: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                clientRequestKey: string;
                digest: string;
                previewId: string;
            };
            output: ({
                issueId: string;
                issueIdentifier: string;
                issueUrl: string;
                duplicate: true;
            } & Disposable) | ({
                issueId: string;
                issueIdentifier: string;
                issueUrl: string;
                duplicate: false;
            } & Disposable);
            meta: object;
        }>;
        acceptIssueLink: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                identifier: string;
                teamThreadId: string;
            };
            output: {
                issueId: string;
                issueIdentifier: string;
                issueUrl: string;
            } & Disposable;
            meta: object;
        }>;
        unlinkIssue: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                linkId: string;
            };
            output: {
                ok: boolean;
            } & Disposable;
            meta: object;
        }>;
        addExternalLink: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                kind: "crm" | "customer" | "other";
                label: string;
                teamThreadId: string;
                url: string;
            };
            output: {
                id: string;
            } & Disposable;
            meta: object;
        }>;
        removeExternalLink: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                linkId: string;
            };
            output: {
                ok: boolean;
            } & Disposable;
            meta: object;
        }>;
        listOutboundWebhooks: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
            };
            output: {
                hasSecret: boolean;
                id: string;
                url: string;
                events: import("../lib/teams/team-integrations-shared").OutboundEventType[];
                active: boolean;
                consecutiveFailures: number;
                createdAt: Date;
            }[] & Disposable;
            meta: object;
        }>;
        createOutboundWebhook: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                url: string;
                events: string[];
                secret: string;
            };
            output: {
                id: string;
            } & Disposable;
            meta: object;
        }>;
        setOutboundWebhookActive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                active: boolean;
                teamId: string;
                webhookId: string;
            };
            output: {
                ok: boolean;
            } & Disposable;
            meta: object;
        }>;
        listOutboundDeliveries: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                webhookId: string;
                status?: "pending" | "sending" | "delivered" | "dead" | undefined;
            };
            output: {
                id: string;
                eventType: import("../lib/teams/team-integrations-shared").OutboundEventType;
                status: import("../lib/teams/team-integrations-shared").OutboundDeliveryStatus;
                attempts: number;
                lastError: string | null;
                createdAt: Date;
                deliveredAt: Date | null;
            }[] & Disposable;
            meta: object;
        }>;
        retryDeadOutbound: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                teamId: string;
                webhookId: string;
            };
            output: {
                revived: number;
            } & Disposable;
            meta: object;
        }>;
        exportActivity: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                teamId: string;
                limit?: number | undefined;
                cursor?: string | null | undefined;
            };
            output: never;
            meta: object;
        }>;
    }>>;
    templates: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                templates: never;
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                subject?: string | undefined;
                to?: string[] | undefined;
                cc?: string[] | undefined;
                bcc?: string[] | undefined;
                body?: string | undefined;
            };
            output: {
                template: {
                    id: string;
                    userId: string;
                    name: string;
                    subject: string | null;
                    body: string | null;
                    to: string[] | null;
                    cc: string[] | null;
                    bcc: string[] | null;
                    createdAt: Date;
                    updatedAt: Date;
                };
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    meet: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        prepareFromThread: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                threadId: string;
            };
            output: {
                preview: import("../lib/meetings/prepare-from-thread").MeetingPreview;
            };
            meta: object;
        }>;
        getAvailability: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                timeZone: string;
                timeMin: string;
                timeMax: string;
            };
            output: {
                authorizationRequired: false;
                busy: import("../lib/meetings/freebusy").AvailabilityInterval[];
            } | {
                authorizationRequired: true;
                busy: never[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: Response | {
                success: boolean;
                data: {
                    created_at: string;
                    id: string;
                    is_large: boolean;
                    live_stream_on_start: boolean;
                    persist_chat: boolean;
                    record_on_start: boolean;
                    status: string;
                    summarize_on_end: boolean;
                    updated_at: string;
                };
            };
            meta: object;
        }>;
    }>>;
    calendar: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listDay: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                timeZone: string;
                timeMin: string;
                timeMax: string;
            };
            output: {
                supported: false;
                authorizationRequired: boolean;
                events: never[];
            } | {
                authorizationRequired: boolean;
                events: import("../lib/calendar/events").CalendarEvent[];
                supported: true;
            };
            meta: object;
        }>;
        createEvent: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                title: string;
                timeZone: string;
                start: string;
                end: string;
                description?: string | undefined;
                location?: string | undefined;
                attendees?: string[] | undefined;
                allDay?: boolean | undefined;
                createMeetLink?: boolean | undefined;
            };
            output: {
                authorizationRequired: boolean;
                event: import("../lib/calendar/events").CalendarEvent | null;
            };
            meta: object;
        }>;
    }>>;
    logging: import("@trpc/server").TRPCBuiltRouter<{
        ctx: {
            c: import("hono").Context<{
                Bindings: Record<string, unknown>;
                Variables: {
                    auth: {
                        api: {
                            listUserAccounts: (input: {
                                headers: Headers;
                            }) => Promise<{
                                accountId: string;
                                providerId: string;
                                scopes?: readonly string[] | null;
                            }[]>;
                            getAccessToken: (input: {
                                body: {
                                    providerId: string;
                                    accountId?: string;
                                };
                                headers: Headers;
                            }) => Promise<{
                                accessToken?: string | null;
                                scopes?: readonly string[] | null;
                            }>;
                            signOut: (input: {
                                headers: Headers;
                            }) => Promise<unknown>;
                            deleteUser: (input: {
                                body: {
                                    callbackURL: string;
                                };
                                headers: Headers;
                                request: Request;
                            }) => Promise<{
                                success: boolean;
                                message: string;
                            }>;
                        };
                    };
                    sessionUser?: {
                        id: string;
                        name: string;
                        email: string;
                    };
                    traceId?: string;
                    requestId?: string;
                };
            }>;
            sessionUser?: {
                id: string;
                name: string;
                email: string;
            };
        };
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getSessionStats: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("../types/logging").SessionStats;
            meta: object;
        }>;
        clearSession: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getSessionState: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("../types/logging").LoggingState;
            meta: object;
        }>;
    }>>;
}>>;
export type AppRouter = typeof appRouter;
export type Inputs = inferRouterInputs<AppRouter>;
export type Outputs = inferRouterOutputs<AppRouter>;

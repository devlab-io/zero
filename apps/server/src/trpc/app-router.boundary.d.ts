// GENERATED — DO NOT EDIT BY HAND.
// Regenerate: pnpm --filter @zero/server gen:trpc-boundary
// Source of truth: apps/server/src/trpc/router.ts (emitted via tsconfig.boundary.json).
//
// apps/mail's type boundary for AppRouter (issue devlab-io/zero#43): a self-contained
// declaration carrying every procedure's exact input/output types, with the client-unused
// server context env neutralised so apps/mail's tsc no longer compiles the server graph.
// A CI check re-runs the generator and fails on drift. See docs/adr/0006-trpc-type-boundary.md.
import { type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
export declare const appRouter: import('@trpc/server').TRPCBuiltRouter<
  {
    ctx: {
      c: import('hono').Context<{
        Bindings: Record<string, unknown>;
        Variables: {
          auth: {
            api: {
              signOut: (input: { headers: Headers }) => Promise<unknown>;
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
    errorShape: {
      data: {
        appCode: import('../lib/errors').ErrorCode;
        code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
        httpStatus: number;
        path?: string;
        stack?: string;
      };
      message: string;
      code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
    };
    transformer: true;
  },
  import('@trpc/server').TRPCDecorateCreateRouterOptions<{
    ai: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        generateSearchQuery: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            query: string;
          };
          output: {
            query: string;
          };
          meta: object;
        }>;
        compose: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            prompt: string;
            to?: string[] | undefined;
            cc?: string[] | undefined;
            threadMessages?:
              | {
                  subject: string;
                  to: string[];
                  body: string;
                  from: string;
                  cc?: string[] | undefined;
                }[]
              | undefined;
            emailSubject?: string | undefined;
          };
          output: {
            newBody: string;
          };
          meta: object;
        }>;
        generateEmailSubject: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            message: string;
          };
          output: {
            subject: string;
          };
          meta: object;
        }>;
        webSearch: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            query: string;
          };
          output: import('ai').GenerateTextResult<import('ai').ToolSet, never>;
          meta: object;
        }>;
      }>
    >;
    bimi: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        getByEmail: import('@trpc/server').TRPCQueryProcedure<{
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
        getByDomain: import('@trpc/server').TRPCQueryProcedure<{
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
      }>
    >;
    brain: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        enableBrain: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output: boolean;
          meta: object;
        }>;
        disableBrain: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output: void;
          meta: object;
        }>;
        generateSummary: import('@trpc/server').TRPCQueryProcedure<{
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
        getState: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            enabled: boolean;
          };
          meta: object;
        }>;
        getLabels: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            name: string;
            usecase: string;
          }[];
          meta: object;
        }>;
        getPrompts: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: Record<import('@zero/types').EPrompts, string>;
          meta: object;
        }>;
        updatePrompt: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            content: string;
            promptType: import('@zero/types').EPrompts;
          };
          output: {
            success: boolean;
          };
          meta: object;
        }>;
        updateLabels: import('@trpc/server').TRPCMutationProcedure<{
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
      }>
    >;
    categories: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        defaults: import('@trpc/server').TRPCQueryProcedure<{
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
      }>
    >;
    connections: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        list: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            connections: {
              id: string;
              email: string;
              name: string | null;
              picture: string | null;
              createdAt: Date;
              providerId: 'google' | 'microsoft';
            }[];
            disconnectedIds: string[];
          };
          meta: object;
        }>;
        setDefault: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            connectionId: string;
          };
          output: void;
          meta: object;
        }>;
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            connectionId: string;
          };
          output: void;
          meta: object;
        }>;
        getDefault: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            id: string;
            email: string;
            name: string | null;
            picture: string | null;
            createdAt: Date;
            providerId: 'google' | 'microsoft';
          } | null;
          meta: object;
        }>;
      }>
    >;
    cookiePreferences: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        getPreferences: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: import('../lib/cookies').CookiePreferences;
          meta: object;
        }>;
        updatePreferences: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            enabled: boolean;
            category: 'necessary' | 'functional' | 'analytics' | 'marketing';
          };
          output: import('../lib/cookies').CookiePreferences;
          meta: object;
        }>;
      }>
    >;
    drafts: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        create: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            message: string;
            id: string | null;
            subject: string;
            to: string;
            threadId: string | null;
            fromEmail: string | null;
            cc?: string | undefined;
            bcc?: string | undefined;
            attachments?:
              | {
                  name: string;
                  type: string;
                  size: number;
                  lastModified: number;
                  base64: string;
                }[]
              | undefined;
          };
          output: {
            id?: string | null | undefined;
            success?: boolean | undefined;
            error?: string | undefined;
          } & Disposable;
          meta: object;
        }>;
        get: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            id: string;
          };
          output: import('@zero/types').ParsedDraft;
          meta: object;
        }>;
        list: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            pageToken?: string | undefined;
            q?: string | undefined;
            maxResults?: number | undefined;
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
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: boolean;
          meta: object;
        }>;
      }>
    >;
    labels: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        list: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            name: string;
            id: string;
            type: string;
            color?:
              | {
                  backgroundColor: string;
                  textColor: string;
                }
              | undefined;
          }[];
          meta: object;
        }>;
        create: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            name: string;
            color?:
              | {
                  backgroundColor: string;
                  textColor: string;
                }
              | undefined;
          };
          output: void;
          meta: object;
        }>;
        update: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            name: string;
            id: string;
            type?: string | undefined;
            color?:
              | {
                  backgroundColor: string;
                  textColor: string;
                }
              | undefined;
          };
          output: void;
          meta: object;
        }>;
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: void;
          meta: object;
        }>;
      }>
    >;
    mail: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        suggestRecipients: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            query?: string | undefined;
            limit?: number | undefined;
          };
          output: {
            email: string;
            name: string | null | undefined;
            displayText: string;
          }[] &
            Disposable;
          meta: object;
        }>;
        forceSync: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output: void;
          meta: object;
        }>;
        get: import('@trpc/server').TRPCQueryProcedure<{
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
              cc:
                | {
                    email: string;
                    name?: string | undefined;
                  }[]
                | null;
              bcc:
                | {
                    email: string;
                    name?: string | undefined;
                  }[]
                | null;
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
              attachments?:
                | {
                    body: string;
                    attachmentId: string;
                    filename: string;
                    mimeType: string;
                    size: number;
                    headers: {
                      name: string | null;
                      value: string | null;
                    }[];
                  }[]
                | undefined;
              isDraft?: boolean | undefined;
            }[];
            hasUnread: boolean;
            totalReplies: number;
            labels: {
              name: string;
              id: string;
            }[];
            latest?:
              | {
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
                  cc:
                    | {
                        email: string;
                        name?: string | undefined;
                      }[]
                    | null;
                  bcc:
                    | {
                        email: string;
                        name?: string | undefined;
                      }[]
                    | null;
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
                  attachments?:
                    | {
                        body: string;
                        attachmentId: string;
                        filename: string;
                        mimeType: string;
                        size: number;
                        headers: {
                          name: string | null;
                          value: string | null;
                        }[];
                      }[]
                    | undefined;
                  isDraft?: boolean | undefined;
                }
              | undefined;
          };
          meta: object;
        }>;
        openThread: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            id: string;
            theme?: 'light' | 'dark' | undefined;
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
                cc:
                  | {
                      email: string;
                      name?: string | undefined;
                    }[]
                  | null;
                bcc:
                  | {
                      email: string;
                      name?: string | undefined;
                    }[]
                  | null;
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
                attachments?:
                  | {
                      body: string;
                      attachmentId: string;
                      filename: string;
                      mimeType: string;
                      size: number;
                      headers: {
                        name: string | null;
                        value: string | null;
                      }[];
                    }[]
                  | undefined;
                isDraft?: boolean | undefined;
              }[];
              hasUnread: boolean;
              totalReplies: number;
              labels: {
                name: string;
                id: string;
              }[];
              latest?:
                | {
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
                    cc:
                      | {
                          email: string;
                          name?: string | undefined;
                        }[]
                      | null;
                    bcc:
                      | {
                          email: string;
                          name?: string | undefined;
                        }[]
                      | null;
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
                    attachments?:
                      | {
                          body: string;
                          attachmentId: string;
                          filename: string;
                          mimeType: string;
                          size: number;
                          headers: {
                            name: string | null;
                            value: string | null;
                          }[];
                        }[]
                      | undefined;
                    isDraft?: boolean | undefined;
                  }
                | undefined;
            };
            rendered: Record<
              string,
              {
                html: string;
                hasBlockedImages: boolean;
              }
            >;
          };
          meta: object;
        }>;
        listThreads: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            folder?: string | undefined;
            q?: string | undefined;
            labelIds?: string[] | undefined;
            maxResults?: number | undefined;
            cursor?: string | undefined;
          };
          output: {
            threads: {
              id: string;
              historyId: string | null;
              subject?: string | undefined;
              sender?:
                | {
                    email: string;
                    name?: string | undefined;
                  }
                | undefined;
              receivedOn?: string | undefined;
              unread?: boolean | undefined;
              labels?:
                | {
                    name: string;
                    id: string;
                  }[]
                | undefined;
              $raw?: unknown;
            }[];
            nextPageToken: string | null;
          };
          meta: object;
        }>;
        markAsRead: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        markAsUnread: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        markAsImportant: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        modifyLabels: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            threadId: string[];
            addLabels?: string[] | undefined;
            removeLabels?: string[] | undefined;
          };
          output:
            | {
                success: boolean;
                error?: undefined;
              }
            | {
                success: boolean;
                error: string;
              };
          meta: object;
        }>;
        toggleStar: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output:
            | {
                success: boolean;
                error: string;
              }
            | {
                success: boolean;
                error?: undefined;
              };
          meta: object;
        }>;
        toggleImportant: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output:
            | {
                success: boolean;
                error: string;
              }
            | {
                success: boolean;
                error?: undefined;
              };
          meta: object;
        }>;
        bulkStar: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        bulkMarkImportant: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        bulkUnstar: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        deleteAllSpam: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output: import('../types').DeleteAllSpamResponse;
          meta: object;
        }>;
        bulkUnmarkImportant: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        send: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            message: string;
            subject: string;
            to: {
              email: string;
              name?: string | undefined;
            }[];
            cc?:
              | {
                  email: string;
                  name?: string | undefined;
                }[]
              | undefined;
            bcc?:
              | {
                  email: string;
                  name?: string | undefined;
                }[]
              | undefined;
            threadId?: string | undefined;
            headers?: Record<string, string> | undefined;
            attachments?:
              | {
                  name: string;
                  type: string;
                  size: number;
                  lastModified: number;
                  base64: string;
                }[]
              | undefined;
            fromEmail?: string | undefined;
            isForward?: boolean | undefined;
            originalMessage?: string | undefined;
            draftId?: string | undefined;
            scheduleAt?: string | undefined;
          };
          output:
            | {
                readonly success: false;
                readonly error: 'Invalid schedule date format';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                readonly success: false;
                readonly error: 'Schedule time must be in the future';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                readonly success: false;
                readonly error: 'Schedule time must be at most 365 days ahead: beyond that the message body cannot be stored until its due date';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                readonly success: false;
                readonly error: 'Failed to schedule email status';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                readonly success: false;
                readonly error: 'Failed to schedule email payload';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                readonly success: false;
                readonly error: 'Failed to schedule email (long-term)';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                readonly success: false;
                readonly error: 'Failed to enqueue email send';
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              }
            | {
                success: boolean;
                scheduled: boolean;
                messageId: string;
                sendAt: number;
                error?: undefined;
                queued?: undefined;
              }
            | {
                success: boolean;
                queued: boolean;
                messageId: string;
                sendAt: number;
                error?: undefined;
                scheduled?: undefined;
              }
            | {
                success: boolean;
                error?: undefined;
                scheduled?: undefined;
                messageId?: undefined;
                sendAt?: undefined;
                queued?: undefined;
              };
          meta: object;
        }>;
        unsend: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            messageId: string;
          };
          output:
            | {
                readonly success: false;
                readonly error: "Unauthorized: Cannot cancel another user's scheduled email";
              }
            | {
                readonly success: false;
                readonly error: 'Invalid scheduled email data';
              }
            | {
                readonly success: false;
                readonly error: "Unauthorized: Cannot cancel another user's queued email";
              }
            | {
                readonly success: false;
                readonly error: 'Invalid payload data';
              }
            | {
                success: boolean;
                error?: undefined;
              };
          meta: object;
        }>;
        scheduledSendStatus: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            messageId: string;
          };
          output: {
            messageId: string;
            status: string | null;
            reservation: {
              status: string;
              outcome: string | null;
              reservedAt: number | null;
              settledAt: number | null;
              detail: string | null;
            } | null;
            stuck: boolean;
          };
          meta: object;
        }>;
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: boolean;
          meta: object;
        }>;
        bulkDelete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        bulkArchive: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        bulkMute: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output: void[];
          meta: object;
        }>;
        getEmailAliases: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            email: string;
            name?: string | undefined;
            primary?: boolean | undefined;
          }[] &
            Disposable;
          meta: object;
        }>;
        snoozeThreads: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
            wakeAt: string;
          };
          output:
            | {
                success: boolean;
                error: string;
              }
            | {
                success: boolean;
                error?: undefined;
              };
          meta: object;
        }>;
        unsnoozeThreads: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            ids: string[];
          };
          output:
            | {
                success: boolean;
                error: string;
              }
            | {
                success: boolean;
                error?: undefined;
              };
          meta: object;
        }>;
        getMessageAttachments: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            messageId: string;
          };
          output: {
            filename: string;
            mimeType: string;
            size: number;
            attachmentId: string;
            headers: {
              name: string;
              value: string;
            }[];
            body: string;
          }[];
          meta: object;
        }>;
        processEmailContent: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            html: string;
            theme: 'light' | 'dark';
            shouldLoadImages: boolean;
          };
          output: {
            processedHtml: string;
            hasBlockedImages: boolean;
          };
          meta: object;
        }>;
        getRawEmail: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            id: string;
          };
          output: string;
          meta: object;
        }>;
        verifyEmail: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            id: string;
          };
          output: {
            isVerified: boolean;
            logoUrl?: string;
          };
          meta: object;
        }>;
      }>
    >;
    notes: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        list: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            threadId: string;
          };
          output: {
            notes: {
              id: string;
              threadId: string;
              order: number;
              createdAt: Date;
              updatedAt: Date;
              userId: string;
              content: string;
              color: string;
              isPinned: boolean | null;
            }[];
          };
          meta: object;
        }>;
        create: import('@trpc/server').TRPCMutationProcedure<{
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
              order: number;
              createdAt: Date;
              updatedAt: Date;
              userId: string;
              content: string;
              color: string;
              isPinned: boolean | null;
            };
          };
          meta: object;
        }>;
        update: import('@trpc/server').TRPCMutationProcedure<{
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
              order: number;
              createdAt: Date;
              updatedAt: Date;
              userId: string;
              content: string;
              color: string;
              isPinned: boolean | null;
            };
          };
          meta: object;
        }>;
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            noteId: string;
          };
          output: {
            success: boolean;
          };
          meta: object;
        }>;
        reorder: import('@trpc/server').TRPCMutationProcedure<{
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
      }>
    >;
    outbox: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        list: import('@trpc/server').TRPCQueryProcedure<{
          input:
            | {
                status?:
                  | 'sent'
                  | 'queued'
                  | 'failed'
                  | 'sending'
                  | 'cancelled'
                  | 'generating'
                  | 'draft_ready'
                  | 'approved'
                  | undefined;
              }
            | undefined;
          output: import('../lib/draft-outbox').DraftOutboxItem[];
          meta: object;
        }>;
        get: import('@trpc/server').TRPCQueryProcedure<{
          input: {
            id: string;
          };
          output: import('../lib/draft-outbox').DraftOutboxItem;
          meta: object;
        }>;
        enqueue: import('@trpc/server').TRPCMutationProcedure<{
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
        approve: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: import('../lib/draft-outbox').DraftOutboxItem | undefined;
          meta: object;
        }>;
        cancel: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: import('../lib/draft-outbox').DraftOutboxItem | undefined;
          meta: object;
        }>;
        retry: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: import('../lib/draft-outbox').DraftOutboxItem | undefined;
          meta: object;
        }>;
      }>
    >;
    shortcut: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        update: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            shortcuts: {
              keys: string[];
              type: 'single' | 'combination';
              action: string;
              scope: string;
              description: string;
              preventDefault?: boolean | undefined;
            }[];
          };
          output: void;
          meta: object;
        }>;
      }>
    >;
    settings: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        get: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            settings: {
              language: string;
              timezone: string;
              externalImages: boolean;
              customPrompt: string;
              colorTheme: 'light' | 'dark' | 'system';
              zeroSignature: boolean;
              undoSendEnabled: boolean;
              imageCompression: 'low' | 'medium' | 'original';
              autoRead: boolean;
              animations: boolean;
              dynamicContent?: boolean | undefined;
              isOnboarded?: boolean | undefined;
              trustedSenders?: string[] | undefined;
              categories?:
                | {
                    name: string;
                    id: string;
                    searchValue: string;
                    order: number;
                    isDefault: boolean;
                    icon?: string | undefined;
                  }[]
                | undefined;
              defaultEmailAlias?: string | undefined;
            };
          };
          meta: object;
        }>;
        save: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            language?: string | undefined;
            timezone?: string | undefined;
            dynamicContent?: boolean | undefined;
            externalImages?: boolean | undefined;
            customPrompt?: string | undefined;
            isOnboarded?: boolean | undefined;
            trustedSenders?: string[] | undefined;
            colorTheme?: 'light' | 'dark' | 'system' | undefined;
            zeroSignature?: boolean | undefined;
            categories?:
              | {
                  name: string;
                  id: string;
                  searchValue: string;
                  order: number;
                  icon?: string | undefined;
                  isDefault?: boolean | undefined;
                }[]
              | undefined;
            defaultEmailAlias?: string | undefined;
            undoSendEnabled?: boolean | undefined;
            imageCompression?: 'low' | 'medium' | 'original' | undefined;
            autoRead?: boolean | undefined;
            animations?: boolean | undefined;
          };
          output: {
            success: boolean;
          };
          meta: object;
        }>;
      }>
    >;
    user: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output: {
            success: boolean;
            message: string;
          };
          meta: object;
        }>;
        getIntercomToken: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: string;
          meta: object;
        }>;
      }>
    >;
    templates: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        list: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: {
            templates: never;
          };
          meta: object;
        }>;
        create: import('@trpc/server').TRPCMutationProcedure<{
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
        delete: import('@trpc/server').TRPCMutationProcedure<{
          input: {
            id: string;
          };
          output: {
            success: boolean;
          };
          meta: object;
        }>;
      }>
    >;
    meet: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        create: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output:
            | Response
            | {
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
      }>
    >;
    logging: import('@trpc/server').TRPCBuiltRouter<
      {
        ctx: {
          c: import('hono').Context<{
            Bindings: Record<string, unknown>;
            Variables: {
              auth: {
                api: {
                  signOut: (input: { headers: Headers }) => Promise<unknown>;
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
        errorShape: {
          data: {
            appCode: import('../lib/errors').ErrorCode;
            code: import('@trpc/server').TRPC_ERROR_CODE_KEY;
            httpStatus: number;
            path?: string;
            stack?: string;
          };
          message: string;
          code: import('@trpc/server').TRPC_ERROR_CODE_NUMBER;
        };
        transformer: true;
      },
      import('@trpc/server').TRPCDecorateCreateRouterOptions<{
        getSessionStats: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: import('../types/logging').SessionStats;
          meta: object;
        }>;
        clearSession: import('@trpc/server').TRPCMutationProcedure<{
          input: void;
          output: {
            success: boolean;
          };
          meta: object;
        }>;
        getSessionState: import('@trpc/server').TRPCQueryProcedure<{
          input: void;
          output: import('../types/logging').LoggingState;
          meta: object;
        }>;
      }>
    >;
  }>
>;
export type AppRouter = typeof appRouter;
export type Inputs = inferRouterInputs<AppRouter>;
export type Outputs = inferRouterOutputs<AppRouter>;

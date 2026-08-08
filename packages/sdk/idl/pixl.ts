/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pixl.json`.
 */
export type Pixl = {
  "address": "BYH38xZxN4akDTh4kpj1ntMUPLU5LRJ1wP9rzmaUFwFw",
  "metadata": {
    "name": "pixl",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "commitAndUndelegatePlayer",
      "discriminator": [
        107,
        76,
        176,
        95,
        152,
        184,
        182,
        76
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "feePayer",
          "writable": true
        },
        {
          "name": "magicFeeVault",
          "writable": true
        },
        {
          "name": "season",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "season.id",
                "account": "season"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "seasonProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "season"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "commitGameplayState",
      "discriminator": [
        103,
        168,
        232,
        203,
        110,
        129,
        118,
        22
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "feePayer",
          "docs": [
            "Delegated fee payer PDA that pays the commit fee (lifts the 10-commit",
            "sponsored cap). Passed as raw AccountInfo since it is delegated; signed",
            "via seeds. CHECK: address verified against `[FEE_PAYER_SEED]` in handler."
          ],
          "writable": true
        },
        {
          "name": "magicFeeVault",
          "docs": [
            "Validator fee vault credited with each paid commit. The Magic program",
            "validates this destination. CHECK: validated by the Magic program."
          ],
          "writable": true
        },
        {
          "name": "season",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "season.id",
                "account": "season"
              }
            ]
          }
        },
        {
          "name": "seasonStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "season"
              }
            ]
          }
        },
        {
          "name": "canvas",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "undelegate",
          "type": "bool"
        }
      ]
    },
    {
      "name": "delegateAny",
      "discriminator": [
        239,
        115,
        76,
        68,
        59,
        155,
        114,
        44
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferTargetAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "targetAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                156,
                152,
                1,
                220,
                66,
                195,
                29,
                187,
                66,
                162,
                168,
                111,
                63,
                214,
                183,
                20,
                198,
                144,
                138,
                26,
                104,
                246,
                102,
                128,
                61,
                60,
                226,
                129,
                40,
                227,
                115,
                250
              ]
            }
          }
        },
        {
          "name": "delegationRecordTargetAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "targetAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataTargetAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "targetAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "targetAccount",
          "writable": true
        },
        {
          "name": "season"
        },
        {
          "name": "game"
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "BYH38xZxN4akDTh4kpj1ntMUPLU5LRJ1wP9rzmaUFwFw"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "delegateCanvas",
      "discriminator": [
        202,
        133,
        206,
        184,
        226,
        235,
        15,
        185
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferCanvas",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "canvas"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                156,
                152,
                1,
                220,
                66,
                195,
                29,
                187,
                66,
                162,
                168,
                111,
                63,
                214,
                183,
                20,
                198,
                144,
                138,
                26,
                104,
                246,
                102,
                128,
                61,
                60,
                226,
                129,
                40,
                227,
                115,
                250
              ]
            }
          }
        },
        {
          "name": "delegationRecordCanvas",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "canvas"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataCanvas",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "canvas"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "canvas",
          "writable": true,
          "signer": true
        },
        {
          "name": "season"
        },
        {
          "name": "game"
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "BYH38xZxN4akDTh4kpj1ntMUPLU5LRJ1wP9rzmaUFwFw"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "endSeason",
      "discriminator": [
        167,
        166,
        166,
        109,
        166,
        71,
        15,
        68
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "season",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "season.id",
                "account": "season"
              }
            ]
          }
        },
        {
          "name": "canvas",
          "docs": [
            "Optional: a canvas still delegated to an ER cannot be passed here, so the",
            "season can close on L1 without freezing the ER-resident canvas."
          ],
          "writable": true,
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "initFeePayer",
      "discriminator": [
        204,
        35,
        232,
        222,
        209,
        12,
        111,
        19
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "feePayer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  95,
                  112,
                  97,
                  121,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initGame",
      "discriminator": [
        251,
        46,
        12,
        208,
        184,
        148,
        157,
        73
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "thisProgram",
          "address": "BYH38xZxN4akDTh4kpj1ntMUPLU5LRJ1wP9rzmaUFwFw"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initPlayer",
      "discriminator": [
        114,
        27,
        219,
        144,
        50,
        15,
        228,
        66
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initSeasonProfile",
      "discriminator": [
        131,
        109,
        23,
        215,
        50,
        52,
        228,
        88
      ],
      "accounts": [
        {
          "name": "wallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "docs": [
            "`constraint`. Ownership is intentionally not checked because the Player is",
            "delegated to the ER (owned by the delegation program on L1) after its first",
            "season; only its `key()` is read here, and `join_season` re-validates it."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "season"
        },
        {
          "name": "seasonProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "season"
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinSeason",
      "discriminator": [
        36,
        202,
        202,
        158,
        82,
        34,
        248,
        231
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "season"
        },
        {
          "name": "seasonStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "season"
              }
            ]
          }
        },
        {
          "name": "seasonProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "season"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "paintPixel",
      "discriminator": [
        233,
        130,
        64,
        77,
        21,
        157,
        90,
        233
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "season",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "season.id",
                "account": "season"
              }
            ]
          }
        },
        {
          "name": "canvas",
          "writable": true
        },
        {
          "name": "player",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "seasonProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "season"
              },
              {
                "kind": "account",
                "path": "player.wallet",
                "account": "player"
              }
            ]
          }
        },
        {
          "name": "seasonStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "season"
              }
            ]
          }
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "x",
          "type": "u16"
        },
        {
          "name": "y",
          "type": "u16"
        },
        {
          "name": "colorIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "startSeason",
      "discriminator": [
        152,
        173,
        197,
        144,
        221,
        79,
        236,
        62
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "season",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110
                ]
              },
              {
                "kind": "arg",
                "path": "args.season_id"
              }
            ]
          }
        },
        {
          "name": "seasonStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  97,
                  115,
                  111,
                  110,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "season"
              }
            ]
          }
        },
        {
          "name": "canvas",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "startSeasonArgs"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "canvas",
      "discriminator": [
        239,
        248,
        162,
        140,
        114,
        179,
        55,
        66
      ]
    },
    {
      "name": "feePayer",
      "discriminator": [
        3,
        252,
        50,
        162,
        76,
        46,
        144,
        213
      ]
    },
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "player",
      "discriminator": [
        205,
        222,
        112,
        7,
        165,
        155,
        206,
        218
      ]
    },
    {
      "name": "season",
      "discriminator": [
        76,
        67,
        93,
        156,
        180,
        157,
        248,
        47
      ]
    },
    {
      "name": "seasonProfile",
      "discriminator": [
        19,
        38,
        109,
        181,
        55,
        108,
        5,
        199
      ]
    },
    {
      "name": "seasonStats",
      "discriminator": [
        23,
        137,
        84,
        131,
        148,
        235,
        209,
        2
      ]
    },
    {
      "name": "sessionTokenV2",
      "discriminator": [
        178,
        3,
        85,
        254,
        13,
        116,
        128,
        41
      ]
    }
  ],
  "events": [
    {
      "name": "canvasInitialized",
      "discriminator": [
        97,
        209,
        141,
        17,
        240,
        104,
        123,
        196
      ]
    },
    {
      "name": "gameInitialized",
      "discriminator": [
        82,
        221,
        11,
        2,
        244,
        52,
        240,
        250
      ]
    },
    {
      "name": "pixelPainted",
      "discriminator": [
        96,
        69,
        5,
        89,
        80,
        5,
        196,
        170
      ]
    },
    {
      "name": "playerInitialized",
      "discriminator": [
        214,
        37,
        153,
        142,
        63,
        109,
        206,
        15
      ]
    },
    {
      "name": "playerJoined",
      "discriminator": [
        39,
        144,
        49,
        106,
        108,
        210,
        183,
        38
      ]
    },
    {
      "name": "seasonEnded",
      "discriminator": [
        231,
        210,
        35,
        6,
        231,
        92,
        111,
        69
      ]
    },
    {
      "name": "seasonStarted",
      "discriminator": [
        13,
        80,
        245,
        91,
        31,
        220,
        154,
        47
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Unauthorized action for the provided authority."
    },
    {
      "code": 6001,
      "name": "invalidSeasonId",
      "msg": "The provided season id is invalid."
    },
    {
      "code": 6002,
      "name": "invalidSeasonTime",
      "msg": "The provided season time range is invalid."
    },
    {
      "code": 6003,
      "name": "invalidTitle",
      "msg": "The provided season title is invalid."
    },
    {
      "code": 6004,
      "name": "invalidDescription",
      "msg": "The provided season description is invalid."
    },
    {
      "code": 6005,
      "name": "invalidImageReference",
      "msg": "The provided image reference is invalid."
    },
    {
      "code": 6006,
      "name": "invalidPalette",
      "msg": "The provided palette is invalid."
    },
    {
      "code": 6007,
      "name": "invalidCanvasDimensions",
      "msg": "The provided canvas dimensions are invalid."
    },
    {
      "code": 6008,
      "name": "invalidCoordinate",
      "msg": "The provided coordinate is outside the canvas bounds."
    },
    {
      "code": 6009,
      "name": "invalidColor",
      "msg": "The provided color index is invalid."
    },
    {
      "code": 6010,
      "name": "seasonNotActive",
      "msg": "The season is not active."
    },
    {
      "code": 6011,
      "name": "seasonAlreadyActive",
      "msg": "A season is already active."
    },
    {
      "code": 6012,
      "name": "seasonAlreadyCompleted",
      "msg": "The season has already been completed."
    },
    {
      "code": 6013,
      "name": "seasonNotEnded",
      "msg": "The season has not ended yet."
    },
    {
      "code": 6014,
      "name": "canvasFrozen",
      "msg": "The canvas is frozen."
    },
    {
      "code": 6015,
      "name": "alreadyRegistered",
      "msg": "The player is already registered."
    },
    {
      "code": 6016,
      "name": "alreadyJoined",
      "msg": "The player has already joined this season."
    },
    {
      "code": 6017,
      "name": "playerNotInitialized",
      "msg": "The player account has not been initialized."
    },
    {
      "code": 6018,
      "name": "seasonProfileNotInitialized",
      "msg": "The season profile account has not been initialized."
    },
    {
      "code": 6019,
      "name": "notEnoughEnergy",
      "msg": "The player does not have enough energy."
    },
    {
      "code": 6020,
      "name": "sameColor",
      "msg": "The pixel is already painted with that color."
    },
    {
      "code": 6021,
      "name": "wrongGame",
      "msg": "The provided game account does not match the expected game."
    },
    {
      "code": 6022,
      "name": "wrongSeason",
      "msg": "The provided season account does not match the expected season."
    },
    {
      "code": 6023,
      "name": "wrongCanvas",
      "msg": "The provided canvas account does not match the expected canvas."
    },
    {
      "code": 6024,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow occurred."
    },
    {
      "code": 6025,
      "name": "invalidAccountState",
      "msg": "The account state is invalid for this operation."
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "player",
            "fields": [
              {
                "name": "wallet",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "seasonProfile",
            "fields": [
              {
                "name": "season",
                "type": "pubkey"
              },
              {
                "name": "wallet",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "seasonStats",
            "fields": [
              {
                "name": "season",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "feePayer"
          }
        ]
      }
    },
    {
      "name": "canvas",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "width",
            "type": "u16"
          },
          {
            "name": "height",
            "type": "u16"
          },
          {
            "name": "pixels",
            "type": "bytes"
          },
          {
            "name": "frozen",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "canvasInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "canvas",
            "type": "pubkey"
          },
          {
            "name": "width",
            "type": "u16"
          },
          {
            "name": "height",
            "type": "u16"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "feePayer",
      "docs": [
        "A program-owned PDA used as the delegated fee payer for uncapped ER commits.",
        "It is delegated like gameplay accounts and funded on base layer via",
        "`lamportsDelegatedTransferIx`; the Magic program debits it and credits the",
        "validator `magic_fee_vault` on each paid commit."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "currentSeason",
            "type": "pubkey"
          },
          {
            "name": "currentSeasonId",
            "type": "u32"
          },
          {
            "name": "totalRegisteredPlayers",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gameInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "currentSeasonId",
            "type": "u32"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "pixelPainted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "x",
            "type": "u16"
          },
          {
            "name": "y",
            "type": "u16"
          },
          {
            "name": "oldColorIndex",
            "type": "u8"
          },
          {
            "name": "newColorIndex",
            "type": "u8"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "player",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "availableEnergy",
            "type": "u8"
          },
          {
            "name": "maxEnergy",
            "type": "u8"
          },
          {
            "name": "energyCooldownSeconds",
            "type": "u32"
          },
          {
            "name": "lastEnergyRefresh",
            "type": "i64"
          },
          {
            "name": "lifetimePixels",
            "type": "u64"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          },
          {
            "name": "lastPixelAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "playerInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "maxEnergy",
            "type": "u8"
          },
          {
            "name": "energyCooldownSeconds",
            "type": "u32"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "playerJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "season",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "canvas",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "palette",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "imageUri",
            "type": "string"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "completed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "seasonEnded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "seasonId",
            "type": "u32"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "endedAt",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "seasonProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "pixelsPainted",
            "type": "u64"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "seasonStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "seasonId",
            "type": "u32"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "seasonStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "season",
            "type": "pubkey"
          },
          {
            "name": "totalPixelsPainted",
            "type": "u64"
          },
          {
            "name": "participantCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "sessionTokenV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "startSeasonArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "seasonId",
            "type": "u32"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "palette",
            "type": {
              "vec": "u32"
            }
          },
          {
            "name": "imageUri",
            "type": "string"
          },
          {
            "name": "canvasWidth",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "canvasHeight",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          }
        ]
      }
    }
  ]
};

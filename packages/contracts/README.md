# @edupay/contracts

Reviewed shared web/API request and response contracts belong here. Cross-boundary
shapes use Zod 4 schemas and export TypeScript types inferred from those schemas.
The package contains no Prisma models and no API implementation imports. OpenAPI
remains the externally inspectable API documentation; code generation is not
required for the MVP.

`academic-financial-projection.ts` is the reviewed outbound v1 contract from
Académico to its future financial projection consumer. It exposes enrollment
references and lifecycle metadata, never person or Identity credentials/PII.

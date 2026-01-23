---
applyTo: "IAC/**/*.bicep"
---

# Bicep Infrastructure as Code Instructions

These instructions apply to all Bicep template files in the IAC directory.

## Before Making Changes

1. **Always lint and validate** Bicep templates before committing:
   ```bash
   az bicep lint --file IAC/main.bicep
   az bicep build --file IAC/main.bicep
   ```

2. **Test locally** if possible using what-if deployments:
   ```bash
   az deployment group what-if \
     --resource-group <rg-name> \
     --template-file IAC/main.bicep \
     --parameters environment=dev location=westeurope
   ```

## Parameter Guidelines

### Secure Parameters
- Use `@secure()` decorator for sensitive values (passwords, keys, connection strings)
- **IMPORTANT**: Do NOT pass multi-line secure values (like PEM keys) as inline parameters
  - Multi-line values with special characters cause parsing errors
  - Instead: Set them as app settings via Azure CLI after deployment
  - Example: GitHub App private keys, certificates, etc.

### Parameter Documentation
- Always include `@description()` for all parameters
- Clearly specify format requirements (e.g., "PEM format", "JSON array", etc.)
- Document default values and their implications

## Common Patterns

### Application Settings
- Standard settings should be in the Bicep template
- Complex/multi-line secrets should be set via `az functionapp config appsettings set` after deployment
- Use Key Vault references for production secrets when possible

### Resource Naming
- Use `uniqueString()` for globally unique resource names
- Follow Azure naming conventions and length limits
- Use consistent prefixes/suffixes across resources

## Validation Checklist

Before pushing changes:
- [ ] Run `az bicep lint --file IAC/main.bicep`
- [ ] Run `az bicep build --file IAC/main.bicep`
- [ ] Check for breaking changes to existing parameters
- [ ] Update workflow files if parameters changed
- [ ] Document any new parameters in deployment docs

## Integration with CI/CD

The `deploy-infra.yml` workflow automatically:
1. Lints Bicep templates
2. Builds templates to validate syntax
3. Deploys to Azure
4. Configures secure app settings via Azure CLI

Make sure your changes are compatible with this workflow.

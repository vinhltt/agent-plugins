# gh secret / gh variable — Actions Secrets and Variables

Secret/variable commands across Actions, Codespaces, Dependabot scopes: set, list, delete, view.
Loaded when user works with `gh secret` or `gh variable`.

### Action Secrets (gh secret)

```bash
# List secrets
gh secret list

# Set secret (prompts for value)
gh secret set MY_SECRET

# Set secret from environment
echo "$MY_SECRET" | gh secret set MY_SECRET

# Set secret for specific environment
gh secret set MY_SECRET --env production

# Set secret for organization
gh secret set MY_SECRET --org orgname

# Delete secret
gh secret delete MY_SECRET

# Delete from environment
gh secret delete MY_SECRET --env production
```

### Action Variables (gh variable)

```bash
# List variables
gh variable list

# Set variable
gh variable set MY_VAR "some-value"

# Set variable for environment
gh variable set MY_VAR "value" --env production

# Set variable for organization
gh variable set MY_VAR "value" --org orgname

# Get variable value
gh variable get MY_VAR

# Delete variable
gh variable delete MY_VAR

# Delete from environment
gh variable delete MY_VAR --env production
```


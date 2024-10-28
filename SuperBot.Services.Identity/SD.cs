using Duende.IdentityServer;
using Duende.IdentityServer.Models;

namespace SuperBot.Services.Identity
{
    public static class SD
    {
        public const string Admin = "Admin";
        public const string Customer = "Customer";

        public static IEnumerable<IdentityResource> IdentityResources =>
            new List<IdentityResource>
            {
                new IdentityResources.OpenId(),
                new IdentityResources.Email(),
                new IdentityResources.Profile()
            };

        public static IEnumerable<ApiScope> ApiScopes =>
            new List<ApiScope>
            {
                new ApiScope("mangoAdmin", "Mango Server"),
                new ApiScope(name: "read", displayName: "Read your data."),
                new ApiScope(name: "write", displayName: "Write your data."),
                new ApiScope(name: "delete", displayName: "Delete your data.")
            };

        public static IEnumerable<Client> Clients =>
            new List<Client>
            {
                new Client
                {
                    ClientId = "client",
                    ClientSecrets =
                        { new Secret("secret".Sha256()) }, // TODO Так нельзя делать, нужен настоящий секретный ключ
                    AllowedGrantTypes = GrantTypes.ClientCredentials,
                    AllowedScopes = { "read", "write", "profile" }
                },
                new Client
                {
                    ClientId = "client",
                    ClientSecrets = { new Secret("secret".Sha256()) },
                    AllowedGrantTypes =
                        GrantTypes
                            .Code, // TODO "applicationUrl": "http://localhost:45628", + "sslPort": 44368 В application.json web.Mango
                    RedirectUris = { "https://localhost:44368/signin-oidc" },
                    PostLogoutRedirectUris = { "https://localhost:44368/signout-callback-oidc" },
                    AllowedScopes = new List<string>
                    {
                        IdentityServerConstants.StandardScopes.OpenId,
                        IdentityServerConstants.StandardScopes.Profile,
                        IdentityServerConstants.StandardScopes.Email,
                        "mangoAdmin"
                    }
                }
            };
    }
}

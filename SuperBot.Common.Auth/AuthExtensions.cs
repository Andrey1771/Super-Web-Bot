using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace SuperBot.Common.Auth
{
    public static class AuthExtensions
    {
        public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
        {
            var keycloakSection = configuration.GetSection("Keycloak");
            var uri = keycloakSection["Uri"];
            var realm = keycloakSection["Realm"];
            var clientId = keycloakSection["ClientId"];

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(options =>
            {
                options.Authority = $"{uri}/realms/{realm}";
                options.Audience = clientId;
                options.RequireHttpsMetadata = false; // Включите, если используете HTTPS
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidIssuer = $"{uri}/realms/{realm}",
                    ValidAudience = clientId
                };

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        context.Response.StatusCode = 401;
                        context.Response.ContentType = "application/json";
                        return context.Response.WriteAsync(new { error = "Authentication failed" }.ToString());
                    },
                    OnTokenValidated = context =>
                    {
                        // Вы можете добавить дополнительную логику после успешной проверки токена
                        return Task.CompletedTask;
                    }
                };
            });

            services.AddAuthorization();

            return services;
        }
    }
}

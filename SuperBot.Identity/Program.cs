using Duende.IdentityServer.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;
using SuperBot.Common.Auth;
using System.Text;

var builder = WebApplication.CreateBuilder(args);


// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Добавление CORS с конкретной политикой
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowSpecificOrigin",
        builder =>
        {
            builder.WithOrigins("http://localhost:3000") // Замените на URL вашего клиента
                   .AllowAnyHeader()
                   .AllowAnyMethod()
                   .AllowCredentials(); // Если необходимы куки/учетные данные
        });
});


builder.Services.AddControllers();
builder.Services.AddSingleton<IMongoClient, MongoClient>(sp =>
    new MongoClient(builder.Configuration.GetConnectionString("MongoDb")));
builder.Services.AddScoped(sp => sp.GetRequiredService<IMongoClient>().GetDatabase("AuthServiceDb"));

builder.Services.AddJwtAuthentication(builder.Configuration);

var jwtSection = builder.Configuration.GetSection("JwtSettings");
var key = Encoding.ASCII.GetBytes(jwtSection["SecretKey"]);

builder.Services.AddIdentityServer(options =>
{
    options.IssuerUri = "https://localhost:7083";
    options.UserInteraction.LoginUrl = "/login"; // Укажите путь к вашей странице логина
    options.UserInteraction.LogoutUrl = "/logout"; // Укажите путь к странице выхода
    options.UserInteraction.CreateAccountReturnUrlParameter = "/return";
    options.UserInteraction.LoginReturnUrlParameter = "/return2";
})
.AddDeveloperSigningCredential() // для разработки
.AddInMemoryClients(new List<Client>
{
    new Client
    {
        ClientId = "tale-gameshop",
        ClientSecrets = { new Secret(key.ToString().Sha256()) },
        AllowedGrantTypes = GrantTypes.Code,
        RequirePkce = true,
        RedirectUris = { "http://localhost:3000/login" },
        LogoUri = "http://localhost:3000",
        PostLogoutRedirectUris = { "http://localhost:3000/logout-callback" },
        ClientUri = "http://localhost:3000",
        AllowedScopes = { "openid", "profile", "api_scope" },
       AllowedCorsOrigins = {"http://localhost:3000"},
       RequireClientSecret = false,
    }
})
.AddInMemoryApiScopes(new List<ApiScope>
{
    new ApiScope("api_scope", "Access to API")
})
.AddInMemoryIdentityResources(new List<IdentityResource>
{
    new IdentityResources.OpenId(),
    new IdentityResources.Profile(),
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseDeveloperExceptionPage();
}

app.UseHttpsRedirection();

app.UseRouting();

app.UseCors("AllowSpecificOrigin");

app.UseAuthentication();
app.UseAuthorization();
//app.UseEndpoints(endpoints => endpoints.MapControllers());

app.MapControllers();

// Используем IdentityServer
app.UseIdentityServer();

app.Run();

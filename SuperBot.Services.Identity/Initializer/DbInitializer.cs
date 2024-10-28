using System.Security.Claims;
using IdentityModel;
using SuperBot.Services.Identity.Data;
using SuperBot.Services.Identity.Models;
using Microsoft.AspNetCore.Identity;

namespace SuperBot.Services.Identity.Initializer
{
    public class DbInitializer : IDbInitializer
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;

        public DbInitializer(ApplicationDbContext dbContext, UserManager<ApplicationUser> userManager, RoleManager<IdentityRole> roleManager)
        {
            _dbContext = dbContext;
            _userManager = userManager;
            _roleManager = roleManager;
        }

        public async Task InitializeAsync()
        {
            if (await _roleManager.FindByNameAsync(SD.Admin) != null)
            {
                return;
            }

            await _roleManager.CreateAsync(new IdentityRole(SD.Admin));
            await _roleManager.CreateAsync(new IdentityRole(SD.Customer));



            var adminUser = new ApplicationUser
            {
                UserName = "admin1@gmail.com",
                Email = "admin1@gmail.com",
                EmailConfirmed = true,
                PhoneNumber = "111111111111",
                FirstName = "Ben",
                LastName = "Admin"
            };

            await _userManager.CreateAsync(adminUser, "Admin123*");
            await _userManager.AddToRoleAsync(adminUser, SD.Admin);

            var temp1 = await _userManager.AddClaimsAsync(adminUser, new[]
            {
                new Claim(JwtClaimTypes.Name, $"{adminUser.FirstName} {adminUser.LastName}"),
                new Claim(JwtClaimTypes.GivenName, adminUser.FirstName),
                new Claim(JwtClaimTypes.FamilyName, adminUser.LastName),
                new Claim(JwtClaimTypes.Role, SD.Admin)
            });




            var cusomerUser = new ApplicationUser
            {
                UserName = "customer1@gmail.com",
                Email = "customer1@gmail.com",
                EmailConfirmed = true,
                PhoneNumber = "111111111111",
                FirstName = "Ben",
                LastName = "Cust"
            };

            await _userManager.CreateAsync(cusomerUser, "Admin123*");
            await _userManager.AddToRoleAsync(cusomerUser, SD.Customer);

            var temp2 = await _userManager.AddClaimsAsync(cusomerUser, new[]
            {
                new Claim(JwtClaimTypes.Name, $"{cusomerUser.FirstName} {cusomerUser.LastName}"),
                new Claim(JwtClaimTypes.GivenName, cusomerUser.FirstName),
                new Claim(JwtClaimTypes.FamilyName, cusomerUser.LastName),
                new Claim(JwtClaimTypes.Role, SD.Customer)
            });
        }
    }
}

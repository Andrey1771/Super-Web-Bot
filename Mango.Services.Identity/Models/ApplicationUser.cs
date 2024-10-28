// Copyright (c) Duende Software. All rights reserved.
// See LICENSE in the project root for license information.


using Microsoft.AspNetCore.Identity;

namespace SuperBot.Services.Identity.Models
{
    // Add profile data for application users by adding properties to the ApplicationUser class
    public class ApplicationUser : IdentityUser
    {
        public string FirstName { get; set; } // TODO В IdentityUser есть UserName XD
        public string LastName { get; set; } // TODO В IdentityUser есть UserName XD
    }
}
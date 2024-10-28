using Microsoft.AspNetCore.Mvc;

namespace SuperBot.WebApi.Controllers
{
    public class AdminController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}

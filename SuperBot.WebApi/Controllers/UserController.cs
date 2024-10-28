using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Core.Services.APIs;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserController(IUserRepository _userRepository) : ControllerBase
    {
        // GET: api/user
        [HttpGet]
        public async Task<ActionResult<IEnumerable<User>>> GetAllUsers()
        {
            var users = await _userRepository.GetAllUsersAsync();
            return Ok(users);
        }

        // GET: api/user/{id}
        [HttpGet("{id}")]
        public async Task<ActionResult<User>> GetUserById(string id)
        {
            var user = await _userRepository.GetUserByIdAsync(long.Parse(id));
            if (user == null)
            {
                return NotFound();
            }

            return Ok(user);
        }

        // POST: api/user
        [HttpPost]
        public async Task<ActionResult> CreateUser([FromBody] User newUser)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            await _userRepository.AddUserAsync(newUser);
            return CreatedAtAction(nameof(GetUserById), new { id = newUser.Id }, newUser);
        }

        // PUT: api/user/{id}
        [HttpPut("{id}")]
        public async Task<ActionResult> UpdateUser(string id, [FromBody] User updatedUser)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var user = await _userRepository.GetUserByIdAsync(long.Parse(id));
            if (user == null)
            {
                return NotFound();
            }

            await _userRepository.UpdateUserAsync(updatedUser);
            return NoContent();
        }

        // DELETE: api/user/{id}
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteUser(string id)
        {
            var user = await _userRepository.GetUserByIdAsync(long.Parse(id));
            if (user == null)
            {
                return NotFound();
            }

            await _userRepository.DeleteUserAsync(id);
            return NoContent();
        }
    }
}

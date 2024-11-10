using AutoMapper;
using Microsoft.AspNetCore.Mvc;
using SuperBot.Core.Entities;
using SuperBot.Core.Interfaces;
using SuperBot.Core.Interfaces.IRepositories;
using SuperBot.Infrastructure.Data;

namespace SuperBot.WebApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SettingsController(ISettingsRepository _repository, IMapper _mapper) : Controller
    {
        // GET: api/GameSettings
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SettingsDb>>> GetAllSettings()
        {
            var settings = await _repository.GetAllAsync();
            return Ok(settings);
        }

        // PUT: api/GameSettings
        [HttpPut("")]
        public async Task<ActionResult> UpdateSetting([FromBody] SettingsDb updatedSetting)
        {
            if (updatedSetting == null)
            {
                return BadRequest("Invalid game setting data.");
            }

            var existingSettings = await _repository.GetAllAsync();
            if (existingSettings == null)
            {
                return NotFound(new { Message = $"Game setting not found." });
            }

            var existingSetting = existingSettings.FirstOrDefault();
            

            await _repository.UpdateAsync(_mapper.Map<Settings>(updatedSetting));

            return NoContent();
        }
    }
}

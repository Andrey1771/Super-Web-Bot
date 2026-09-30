using Microsoft.Extensions.DependencyInjection;
using SuperBot.Application.Commands.Telegram;
using SuperBot.Application.Messaging;
using Xunit;

namespace SuperBot.Tests
{
    /// <summary>
    /// Собственный посредник команд бота (замена MediatR): команда доходит до своего обработчика,
    /// и у каждой команды бота обработчик действительно зарегистрирован — иначе бот падал бы
    /// только в момент, когда пользователь нажмёт соответствующую кнопку.
    /// </summary>
    public class MediatorTests
    {
        public sealed class Ping : IRequest<string>
        {
            public string Text { get; init; } = string.Empty;
        }

        public sealed class PingHandler : IRequestHandler<Ping, string>
        {
            public Task<string> Handle(Ping request, CancellationToken cancellationToken) => Task.FromResult("pong:" + request.Text);
        }

        public sealed class Touch : IRequest
        {
            public List<string> Log { get; } = new();
        }

        public sealed class TouchHandler : IRequestHandler<Touch>
        {
            public Task Handle(Touch request, CancellationToken cancellationToken)
            {
                request.Log.Add("handled");
                return Task.CompletedTask;
            }
        }

        public sealed class Orphan : IRequest<int>
        {
        }

        private static IMediator Build()
        {
            var services = new ServiceCollection();
            services.AddMediator(typeof(MediatorTests).Assembly);
            return services.BuildServiceProvider().GetRequiredService<IMediator>();
        }

        [Fact]
        public async Task A_command_with_a_result_reaches_its_handler()
        {
            Assert.Equal("pong:hi", await Build().Send(new Ping { Text = "hi" }));
        }

        [Fact]
        public async Task A_command_without_a_result_reaches_its_handler()
        {
            var touch = new Touch();
            await Build().Send(touch);
            Assert.Equal(new[] { "handled" }, touch.Log);
        }

        [Fact]
        public async Task A_command_without_a_handler_fails_loudly()
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => Build().Send(new Orphan()));
        }

        [Fact]
        public void Every_bot_command_has_exactly_one_handler()
        {
            var assembly = typeof(GetMainMenuCommand).Assembly;
            var services = new ServiceCollection();
            services.AddMediator(assembly);

            var requestTypes = assembly.GetTypes()
                .Where(type => type is { IsClass: true, IsAbstract: false } && typeof(IBaseRequest).IsAssignableFrom(type))
                .ToList();
            // BaseCommand и BaseMessageCommand — общие предки, а не команды: их никто не отправляет.
            var commands = requestTypes.Where(type => !requestTypes.Any(other => other.BaseType == type)).ToList();
            Assert.NotEmpty(commands);

            foreach (var command in commands)
            {
                var response = command.GetInterfaces()
                    .FirstOrDefault(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IRequest<>))
                    ?.GetGenericArguments()[0];
                var contract = response is null
                    ? typeof(IRequestHandler<>).MakeGenericType(command)
                    : typeof(IRequestHandler<,>).MakeGenericType(command, response);
                Assert.True(services.Count(descriptor => descriptor.ServiceType == contract) == 1, $"{command.Name}: expected exactly one handler");
            }
        }
    }
}

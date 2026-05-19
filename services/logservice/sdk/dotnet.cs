/*
 * .NET SDK for the centralized logging service.
 *
 * Usage in Program.cs:
 *   builder.Services.AddSingleton(new LogServiceClient("lemonadestand"));
 *   // After building the app, before other middleware:
 *   app.UseMiddleware<LogServiceMiddleware>();
 */

using System.Net.Http.Json;
using System.Text.Json;

namespace LemonadeStand.Api.Middleware;

public class LogServiceClient
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private readonly string _service;
    private readonly string _endpoint;
    private readonly string? _apiKey;

    public LogServiceClient(string service)
    {
        _service = service;
        _endpoint = Environment.GetEnvironmentVariable("LOG_SERVICE_URL") ?? "";
        _apiKey = Environment.GetEnvironmentVariable("LOG_SERVICE_API_KEY");
    }

    public async Task LogError(string message, Exception? ex = null, Dictionary<string, object>? context = null)
    {
        if (string.IsNullOrEmpty(_endpoint)) return;

        try
        {
            var entry = new
            {
                service = _service,
                source = "backend",
                level = "error",
                message,
                error_type = ex?.GetType().Name,
                stack_trace = ex?.ToString(),
                context,
                timestamp = DateTime.UtcNow.ToString("o")
            };

            var request = new HttpRequestMessage(HttpMethod.Post, _endpoint)
            {
                Content = JsonContent.Create(new { entries = new[] { entry } })
            };

            if (!string.IsNullOrEmpty(_apiKey))
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _apiKey);

            await _http.SendAsync(request);
        }
        catch
        {
            // Never let logging failures affect the application
        }
    }
}

public class LogServiceMiddleware
{
    private readonly RequestDelegate _next;
    private readonly LogServiceClient _logClient;

    public LogServiceMiddleware(RequestDelegate next, LogServiceClient logClient)
    {
        _next = next;
        _logClient = logClient;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var ctx = new Dictionary<string, object>
            {
                ["method"] = context.Request.Method,
                ["path"] = context.Request.Path.ToString(),
                ["user_agent"] = context.Request.Headers.UserAgent.ToString()
            };

            _ = _logClient.LogError(ex.Message, ex, ctx);
            throw;
        }
    }
}

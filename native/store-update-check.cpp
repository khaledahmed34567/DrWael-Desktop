// Native Store query only. Installation stays with the Microsoft Store UI.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <appmodel.h>
#include <Shobjidl.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.ApplicationModel.h>
#include <winrt/Windows.Services.Store.h>
#include <winrt/Windows.Networking.Connectivity.h>
#include <iostream>
#include <string>
#include <iomanip>
#pragma comment(lib, "windowsapp")

int wmain(int argc, wchar_t** argv) {
  try {
    UINT32 size = 0;
    LONG identity = GetCurrentPackageFullName(&size, nullptr);
    if (identity == APPMODEL_ERROR_NO_PACKAGE) {
      std::cout << "{\"protocol\":1,\"status\":\"error\",\"code\":\"no_package_identity\"}\n";
      return 0;
    }
    if (identity != ERROR_INSUFFICIENT_BUFFER) {
      std::cout << "{\"protocol\":1,\"status\":\"error\",\"code\":\"identity_error\"}\n";
      return 0;
    }
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    auto package = winrt::Windows::ApplicationModel::Package::Current();
    auto family = package.Id().FamilyName();
    if (family != L"sarmad.eg.Dr.waelDesktop_ez1w9zs3mdfdg") {
      std::cout << "{\"protocol\":1,\"status\":\"error\",\"code\":\"wrong_package_identity\"}\n";
      return 0;
    }
    auto version = package.Id().Version();
    auto profile = winrt::Windows::Networking::Connectivity::NetworkInformation::GetInternetConnectionProfile();
    if (!profile || profile.GetNetworkConnectivityLevel() != winrt::Windows::Networking::Connectivity::NetworkConnectivityLevel::InternetAccess) {
      std::cout << R"({"protocol":1,"status":"error","code":"offline"})" << std::endl;
      return 0;
    }
    auto context = winrt::Windows::Services::Store::StoreContext::GetDefault();
    if (argc != 3 || std::wstring(argv[1]) != L"--window-handle") {
      std::cout << R"({"protocol":1,"status":"error","code":"missing_owner_window"})" << std::endl;
      return 0;
    }
    auto owner = reinterpret_cast<HWND>(std::stoull(argv[2]));
    if (!IsWindow(owner)) {
      std::cout << R"({"protocol":1,"status":"error","code":"invalid_owner_window"})" << std::endl;
      return 0;
    }
    // Desktop Store APIs must be associated with the application's HWND.
    winrt::check_hresult(context.as<IInitializeWithWindow>()->Initialize(owner));
    auto updates = context.GetAppAndOptionalStorePackageUpdatesAsync().get();
    bool available = false;
    for (auto const& update : updates) {
      // Optional packages must not accidentally lock the base app.
      if (update.Package().Id().FamilyName() == family) available = true;
    }
    std::cout << "{\"protocol\":1,\"status\":\"" << (available ? "update_available" : "current")
              << "\",\"packageFamily\":\"sarmad.eg.Dr.waelDesktop_ez1w9zs3mdfdg\",\"packageVersion\":\""
              << version.Major << "." << version.Minor << "." << version.Build << "." << version.Revision
              << "\"}\n";
    return 0;
  } catch (winrt::hresult_error const& e) {
    // No localized/error text crosses the process boundary, only a numeric HRESULT.
    std::cout << "{\"protocol\":1,\"status\":\"error\",\"code\":\"store_query_failed\",\"hresult\":\"0x"
              << std::hex << static_cast<unsigned long>(e.code().value) << "\"}\n";
    return 0;
  } catch (...) {
    std::cout << "{\"protocol\":1,\"status\":\"error\",\"code\":\"unexpected_error\"}\n";
    return 0;
  }
}

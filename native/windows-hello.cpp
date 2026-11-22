// Windows Hello only. No PIN/password is received or stored by this process.
// Win32 WebAuthn is loaded at runtime to preserve the old package's loadability.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <webauthn.h>
#include <iostream>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <vector>
#include <algorithm>

static int fail(const char* code, HRESULT hr=E_FAIL) {
 std::cout << "{\"protocol\":1,\"ok\":false,\"code\":\"" << code << "\",\"hresult\":" << (unsigned long)hr << "}";
 return 0;
}
static std::vector<BYTE> decode(std::string s) {
 if(s.empty()||s.size()>16384||s.find_first_not_of("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")!=std::string::npos)return {};
 std::replace(s.begin(),s.end(),'-','+');std::replace(s.begin(),s.end(),'_','/');while(s.size()%4)s+='=';
 DWORD n=0;if(!CryptStringToBinaryA(s.c_str(),(DWORD)s.size(),CRYPT_STRING_BASE64,nullptr,&n,nullptr,nullptr)||n>12288)return {};
 std::vector<BYTE> b(n);if(!CryptStringToBinaryA(s.c_str(),(DWORD)s.size(),CRYPT_STRING_BASE64,b.data(),&n,nullptr,nullptr))return {};b.resize(n);return b;
}
static std::string encode(const BYTE* p,DWORD n) {
 if(!p||!n||n>262144)return "";DWORD size=0;CryptBinaryToStringA(p,n,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,nullptr,&size);
 std::string s(size,'\0');if(!CryptBinaryToStringA(p,n,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,s.data(),&size))return "";
 while(!s.empty()&&(s.back()=='\0'||s.back()=='='))s.pop_back();std::replace(s.begin(),s.end(),'+','-');std::replace(s.begin(),s.end(),'/','_');return s;
}
int main(int argc,char**argv) {
 HMODULE os=LoadLibraryExW(L"webauthn.dll",nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);
 if(!os)return fail("windows_1903_required");
 auto available=(decltype(&WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable))GetProcAddress(os,"WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable");
 auto make=(decltype(&WebAuthNAuthenticatorMakeCredential))GetProcAddress(os,"WebAuthNAuthenticatorMakeCredential");
 auto get=(decltype(&WebAuthNAuthenticatorGetAssertion))GetProcAddress(os,"WebAuthNAuthenticatorGetAssertion");
 auto freeAtt=(decltype(&WebAuthNFreeCredentialAttestation))GetProcAddress(os,"WebAuthNFreeCredentialAttestation");
 auto freeAssertion=(decltype(&WebAuthNFreeAssertion))GetProcAddress(os,"WebAuthNFreeAssertion");
 if(!available||!make||!get||!freeAtt||!freeAssertion)return fail("windows_1903_required");
 BOOL ready=FALSE;HRESULT hr=available(&ready);if(FAILED(hr)||!ready)return fail("hello_setup_required",hr);
 if(argc==2&&std::string(argv[1])=="probe"){std::cout<<"{\"protocol\":1,\"ok\":true,\"available\":true}";return 0;}
 if(argc!=3||(std::string(argv[1])!="create"&&std::string(argv[1])!="get"))return fail("invalid_request");
 std::string handle=argv[2];if(handle.empty()||handle.size()>16||handle.find_first_not_of("0123456789abcdefABCDEF")!=std::string::npos)return fail("invalid_window");
 HWND owner=(HWND)(uintptr_t)strtoull(handle.c_str(),nullptr,16);if(!owner||!IsWindow(owner))return fail("invalid_window");
 std::string line,credentialLine,userLine;if(!std::getline(std::cin,line)||line.size()>16384)return fail("invalid_request");auto client=decode(line);if(client.empty())return fail("invalid_client_data");
 WEBAUTHN_CLIENT_DATA data{};data.dwVersion=WEBAUTHN_CLIENT_DATA_CURRENT_VERSION;data.cbClientDataJSON=(DWORD)client.size();data.pbClientDataJSON=client.data();data.pwszHashAlgId=WEBAUTHN_HASH_ALGORITHM_SHA_256;
 if(std::string(argv[1])=="create") {
  if(!std::getline(std::cin,userLine))return fail("invalid_user");auto userId=decode(userLine);if(userId.size()!=32)return fail("invalid_user");
  WEBAUTHN_RP_ENTITY_INFORMATION rp{};rp.dwVersion=WEBAUTHN_RP_ENTITY_INFORMATION_CURRENT_VERSION;rp.pwszId=L"localhost";rp.pwszName=L"Dr. Wael Desktop";
  WEBAUTHN_USER_ENTITY_INFORMATION user{};user.dwVersion=WEBAUTHN_USER_ENTITY_INFORMATION_CURRENT_VERSION;user.cbId=(DWORD)userId.size();user.pbId=userId.data();user.pwszName=L"DrWaelDesktop";user.pwszDisplayName=L"Dr. Wael Desktop on this Windows account";
  WEBAUTHN_COSE_CREDENTIAL_PARAMETER algorithm{};algorithm.dwVersion=WEBAUTHN_COSE_CREDENTIAL_PARAMETER_CURRENT_VERSION;algorithm.pwszCredentialType=WEBAUTHN_CREDENTIAL_TYPE_PUBLIC_KEY;algorithm.lAlg=WEBAUTHN_COSE_ALGORITHM_ECDSA_P256_WITH_SHA256;
  WEBAUTHN_COSE_CREDENTIAL_PARAMETERS algorithms{1,&algorithm};
  WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS options{};options.dwVersion=WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS_VERSION_1;options.dwTimeoutMilliseconds=60000;options.dwAuthenticatorAttachment=WEBAUTHN_AUTHENTICATOR_ATTACHMENT_PLATFORM;options.bRequireResidentKey=FALSE;options.dwUserVerificationRequirement=WEBAUTHN_USER_VERIFICATION_REQUIREMENT_REQUIRED;options.dwAttestationConveyancePreference=WEBAUTHN_ATTESTATION_CONVEYANCE_PREFERENCE_NONE;
  PWEBAUTHN_CREDENTIAL_ATTESTATION result=nullptr;hr=make(owner,&rp,&user,&algorithms,&data,&options,&result);if(FAILED(hr)||!result)return fail("verification_failed",hr);
  std::cout<<"{\"protocol\":1,\"ok\":true,\"id\":\""<<encode(result->pbCredentialId,result->cbCredentialId)<<"\",\"attestationObject\":\""<<encode(result->pbAttestationObject,result->cbAttestationObject)<<"\"}";freeAtt(result);return 0;
 }
 if(!std::getline(std::cin,credentialLine))return fail("invalid_credential");auto id=decode(credentialLine);if(id.empty()||id.size()>4096)return fail("invalid_credential");
 WEBAUTHN_CREDENTIAL cred{};cred.dwVersion=WEBAUTHN_CREDENTIAL_CURRENT_VERSION;cred.cbId=(DWORD)id.size();cred.pbId=id.data();cred.pwszCredentialType=WEBAUTHN_CREDENTIAL_TYPE_PUBLIC_KEY;
 WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS options{};options.dwVersion=WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS_VERSION_1;options.dwTimeoutMilliseconds=60000;options.CredentialList={1,&cred};options.dwAuthenticatorAttachment=WEBAUTHN_AUTHENTICATOR_ATTACHMENT_PLATFORM;options.dwUserVerificationRequirement=WEBAUTHN_USER_VERIFICATION_REQUIREMENT_REQUIRED;
 PWEBAUTHN_ASSERTION result=nullptr;hr=get(owner,L"localhost",&data,&options,&result);if(FAILED(hr)||!result)return fail("verification_failed",hr);
 std::cout<<"{\"protocol\":1,\"ok\":true,\"id\":\""<<encode(result->Credential.pbId,result->Credential.cbId)<<"\",\"authenticatorData\":\""<<encode(result->pbAuthenticatorData,result->cbAuthenticatorData)<<"\",\"signature\":\""<<encode(result->pbSignature,result->cbSignature)<<"\",\"userHandle\":\""<<encode(result->pbUserId,result->cbUserId)<<"\"}";freeAssertion(result);return 0;
}

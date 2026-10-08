// Adafruit PN532 driver, BSD license. Original notice: pn532_driver_history.hpp.
#pragma once
#include <cstdint>

struct Pn532CardState
{
// NTAG424 authresponse data
#define NTAG424_AUTHRESPONSE_ENC_SIZE 32    ///< Size of encoded Auth-Response
#define NTAG424_AUTHRESPONSE_TI_SIZE 4      ///< Size of TI
#define NTAG424_AUTHRESPONSE_RNDA_SIZE 16   ///< Size of RND
#define NTAG424_AUTHRESPONSE_PDCAP2_SIZE 6  ///< Size of PDCAP2
#define NTAG424_AUTHRESPONSE_PCDCAP2_SIZE 6 ///< Size of PCDCAP2

#define NTAG424_AUTHRESPONSE_TI_OFFSET 0 ///< Offset for TI
#define NTAG424_AUTHRESPONSE_RNDA_OFFSET \
  NTAG424_AUTHRESPONSE_TI_SIZE ///< Offset for RND
#define NTAG424_AUTHRESPONSE_PDCAP2_OFFSET \
  NTAG424_AUTHRESPONSE_TI_SIZE +           \
      NTAG424_AUTHRESPONSE_RNDA_SIZE ///< Offset for PDCAP2
#define NTAG424_AUTHRESPONSE_PCDCAP2_OFFSET                       \
  NTAG424_AUTHRESPONSE_TI_SIZE + NTAG424_AUTHRESPONSE_RNDA_SIZE + \
      NTAG424_AUTHRESPONSE_PDCAP2_SIZE ///< Offset for PCDCAP2

  uint8_t ntag424_authresponse_TI[NTAG424_AUTHRESPONSE_TI_SIZE];     ///< TI Buffer
  uint8_t ntag424_authresponse_RNDA[NTAG424_AUTHRESPONSE_RNDA_SIZE]; ///< RNDA
                                                                     ///< Buffer
  uint8_t
      ntag424_authresponse_PDCAP2[NTAG424_AUTHRESPONSE_PDCAP2_SIZE]; ///< PDCAP2
                                                                     ///< Buffer
  uint8_t ntag424_authresponse_PCDCAP2
      [NTAG424_AUTHRESPONSE_PCDCAP2_SIZE]; ///< PCDCAP2 Buffer

#define NTAG424_SESSION_KEYSIZE 16 ///< Size of auth aes keys in byte

  struct ntag424_SessionType
  {
    bool authenticated; ///< true = authenticated
    int cmd_counter;    ///< command counter
    uint8_t
        session_key_enc[NTAG424_SESSION_KEYSIZE];     ///< session encryption key
    uint8_t session_key_mac[NTAG424_SESSION_KEYSIZE]; ///< session mac key
  }; ///< struct type foir the authentication session data

  struct ntag424_SessionType
      ntag424_Session; ///< authentication session data are stored here

  struct ntag424_VersionInfoType
  {
    uint8_t VendorID;       ///< VendorID
    uint8_t HWType;         ///< HWType
    uint8_t HWSubType;      ///< HWSubType
    uint8_t HWMajorVersion; ///< HWMajorVersion
    uint8_t HWMinorVersion; ///< HWMinorVersion
    uint8_t HWStorageSize;  ///< HWStorageSize
    uint8_t HWProtocol;     ///< HWProtocol
    uint8_t SWType;         ///< SWType
    uint8_t SWSubType;      ///< SWSubType
    uint8_t SWMajorVersion; ///< SWMajorVersion
    uint8_t SWMinorVersion; ///< SWMinorVersion
    uint8_t SWStorageSize;  ///< SWStorageSize
    uint8_t SWProtocol;     ///< SWProtocol
    uint8_t UID[7];         ///< UID
    uint8_t BatchNo[5];     ///< BatchNo
    uint8_t FabKey[2];      ///< FabKey
    uint8_t CWProd;         ///< CWProd
    uint8_t YearProd;       ///< YearProd
    uint8_t FabKeyID;       ///< FabKeyID
  }; ///< struct type for ntag424 versioninfo

  struct ntag424_VersionInfoType ntag424_VersionInfo; ///< global version info

  struct ntag424_FileSettings
  {
    ///<  complex :-(
    uint8_t FileType;          ///< FileType
    uint8_t FileOption;        ///< FileOption
    uint8_t AccessRights;      ///< AccessRights
    uint8_t FileSize;          ///< FileSize
    uint8_t SDMOptions;        ///< SDMOptions
    uint8_t SMDAccessRights;   ///< SMDAccessRights
    uint8_t UIDOffset;         ///< UIDOffset
    uint8_t SDMReadCtrOffset;  ///< SDMReadCtrOffset
    uint8_t PICCDataOffset;    ///< PICCDataOffset
    uint8_t TTStatusOffset;    ///< TTStatusOffset
    uint8_t SDMMACInputOffset; ///< SDMMACInputOffset
    uint8_t SDMENCOffset;      ///< SDMENCOffset
    uint8_t SDMENCLength;      ///< SDMENCLength
    uint8_t SDMMACOffset;      ///< SDMMACOffset
    uint8_t SDMReadCtrlLimit;  ///< SDMReadCtrlLimit
  }; ///<  currently not used. filesettings are more

};
